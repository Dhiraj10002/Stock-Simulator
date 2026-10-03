"""Exercise launch ordering and process cleanup without broker, DB, Docker or network access."""
import json
import os
import pathlib
import shutil
import signal
import subprocess
import tempfile
import time
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]

SERVICE = '''#!/usr/bin/env python3
import json,os,pathlib,time
role=pathlib.Path.cwd().name
with open(os.environ["SIM_TEST_EVENTS"],"a") as stream:
 stream.write(json.dumps({"role":role,"pid":os.getpid()})+"\\n")
if os.environ.get("SIM_TEST_EXIT_ROLE")==role:
 raise SystemExit(7)
time.sleep(120)
'''
CURL = '''#!/usr/bin/env python3
import json,os,pathlib,sys
url=sys.argv[-1]
assert "--fail" in sys.argv and "--max-time" in sys.argv
if ":8080/" in url and url.endswith("/health"):
 counter=pathlib.Path(os.environ["SIM_TEST_EVENTS"]+".counter")
 count=int(counter.read_text())+1 if counter.exists() else 1
 counter.write_text(str(count))
 if count <= int(os.environ.get("SIM_TEST_HEALTH_FAILURES","0")):
  raise SystemExit(22)  # curl --fail returns 22 for HTTP errors.
with open(os.environ["SIM_TEST_EVENTS"],"a") as stream:
 stream.write(json.dumps({"url":url})+"\\n")
'''


class StartupRegressionTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        shutil.copy(ROOT / "start-dev.sh", self.root / "start-dev.sh")
        shutil.copy(ROOT / "stop.sh", self.root / "stop.sh")
        self.events = self.root / "events.jsonl"
        self.bin = self.root / "bin"
        self.bin.mkdir()
        for name, script in (("go",SERVICE),("npm",SERVICE),("curl",CURL),("fuser","#!/bin/sh\nexit 1\n")):
            self.executable(self.bin / name, script)
        for directory in ("backend","frontend","python-services/market-worker","python-services/news-worker"):
            (self.root / directory).mkdir(parents=True)
        for worker in ("market-worker","news-worker"):
            target=self.root / "python-services" / worker / "venv/bin/python"
            target.parent.mkdir(parents=True)
            self.executable(target,SERVICE)
        self.env={**os.environ,"PATH":str(self.bin)+os.pathsep+os.environ["PATH"],"SIM_TEST_EVENTS":str(self.events),"REDIS_URL":"redis://test-supplied-service:6379/0","STARTUP_TIMEOUT_SECONDS":"4"}

    @staticmethod
    def executable(path, content):
        path.write_text(content)
        path.chmod(0o755)

    def records(self):
        return [json.loads(line) for line in self.events.read_text().splitlines()] if self.events.exists() else []

    def launch(self, mode="--light", **environment):
        process=subprocess.Popen(["bash",str(self.root / "start-dev.sh"),mode],cwd=self.root,env={**self.env,**environment},stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
        self.addCleanup(self.stop,process)
        return process

    def stop(self, process):
        if process.poll() is None:
            process.terminate()
        try:
            process.communicate(timeout=15)
        except subprocess.TimeoutExpired:
            process.kill()
            for row in self.records():
                if "pid" in row:
                    try: os.killpg(row["pid"],signal.SIGKILL)
                    except ProcessLookupError: pass
            process.communicate(timeout=5)

    def assert_children_stopped(self):
        for row in self.records():
            if "pid" in row:
                with self.assertRaises(ProcessLookupError): os.kill(row["pid"],0)

    def test_backend_http_failure_aborts_before_frontend_and_cleans_children(self):
        process=self.launch(SIM_TEST_HEALTH_FAILURES="999",STARTUP_TIMEOUT_SECONDS="2")
        output=process.communicate(timeout=15)[0]
        self.assertNotEqual(process.returncode,0,output)
        self.assertIn("Frontend startup aborted",output)
        self.assertNotIn("frontend",[row.get("role") for row in self.records()])
        self.assert_children_stopped()

    def test_early_backend_exit_is_not_reported_as_success(self):
        process=self.launch(SIM_TEST_EXIT_ROLE="backend",SIM_TEST_HEALTH_FAILURES="999")
        output=process.communicate(timeout=15)[0]
        self.assertNotEqual(process.returncode,0,output)
        self.assertNotIn("Platform processes are available",output)
        self.assertNotIn("frontend",[row.get("role") for row in self.records()])
        self.assert_children_stopped()

    def test_full_stack_waits_for_api_then_workers_then_frontend_and_handles_term(self):
        process=self.launch("full",SIM_TEST_HEALTH_FAILURES="2")
        deadline=time.monotonic()+10
        while time.monotonic()<deadline and process.poll() is None:
            rows=self.records()
            if any(row.get("url","").endswith("/ready") for row in rows): break
            time.sleep(0.05)
        else:
            self.fail("stack did not reach readiness reporting")
        labels=[row.get("role") or row["url"] for row in rows]
        health=labels.index("http://127.0.0.1:8080/api/v1/health")
        self.assertLess(labels.index("backend"),health)
        for name in ("market-worker","news-worker","frontend"):
            self.assertLess(health,labels.index(name))
        self.assertLess(labels.index("http://127.0.0.1:8085/health"),labels.index("frontend"))
        process.terminate()
        output=process.communicate(timeout=15)[0]
        self.assertEqual(process.returncode,143,output)
        self.assert_children_stopped()

    def test_child_exit_after_launch_stops_remaining_services(self):
        process=self.launch(SIM_TEST_EXIT_ROLE="frontend")
        output=process.communicate(timeout=15)[0]
        self.assertNotEqual(process.returncode,0,output)
        self.assert_children_stopped()

    def test_stop_ignores_processes_outside_this_checkout(self):
        outside=tempfile.TemporaryDirectory()
        self.addCleanup(outside.cleanup)
        children=[]
        for directory in (self.root / "backend",pathlib.Path(outside.name)):
            child=subprocess.Popen(["python3","-c","import time; time.sleep(120)"],cwd=directory)
            children.append(child)
            self.addCleanup(self.stop,child)
        try:
            os.readlink(f"/proc/{children[0].pid}/cwd")
        except (PermissionError, FileNotFoundError):
            self.skipTest("runtime does not expose child process directories; exercised on Linux CI")
        candidates=" ".join(str(child.pid) for child in children)
        for name in ("fuser","pgrep"):
            self.executable(self.bin / name,'#!/bin/sh\nprintf "%s\\n" "$SIM_TEST_CANDIDATES"\n')
        self.executable(self.bin / "docker","#!/bin/sh\nexit 0\n")
        result=subprocess.run(["bash",str(self.root / "stop.sh")],cwd=self.root,env={**self.env,"SIM_TEST_CANDIDATES":candidates},capture_output=True,text=True,timeout=5)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        children[0].wait(timeout=5)
        self.assertIsNone(children[1].poll(),"stop.sh killed a process from another checkout")


if __name__ == "__main__":
    unittest.main()
