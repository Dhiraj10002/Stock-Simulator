import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const frontend = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2), remote = args.includes("--url") ? args[args.indexOf("--url") + 1] : undefined;
const origin = remote || "http://127.0.0.1:3200";
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function bytes(path) {
  return readdirSync(path, { withFileTypes: true }).reduce((sum, entry) => {
    const child = join(path, entry.name);
    return sum + (entry.isDirectory() ? bytes(child) : statSync(child).size);
  }, 0);
}

async function main() {
  let runtime, server;
  const stop = () => server?.kill();
  process.on("exit", stop);
  try {
    if (!remote) {
      runtime = mkdtempSync(join(tmpdir(), "stock-standalone-"));
      cpSync(join(frontend, ".next/standalone"), runtime, { recursive: true });
      cpSync(join(frontend, ".next/static"), join(runtime, ".next/static"), { recursive: true });
      cpSync(join(frontend, "public"), join(runtime, "public"), { recursive: true });
      console.log(JSON.stringify({ standalonePayloadBytes: bytes(runtime), note: "Uncompressed runtime files; not Docker image size" }));
      // No application source or full node_modules is present in this directory.
      server = spawn(process.execPath, ["server.js"], { cwd: runtime, env: { ...process.env, NODE_ENV: "production", PORT: "3200", HOSTNAME: "127.0.0.1" }, stdio: "inherit" });
    }
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch { /* Server readiness. */ }
      await pause(100);
    }
    assert.ok(ready, "Standalone server must become ready");
    const assets = new Set();
    for (const path of ["/", "/login", "/stocks/RELIANCE"]) {
      const response = await fetch(origin + path);
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get("content-type") || "", /text\/html/);
      const html = await response.text();
      assert.match(html, /<html/);
      if (path === "/") { assert.match(html, /id="hero"/); assert.match(html, /id="platform"/); }
      for (const match of html.matchAll(/(?:src|href)="([^" ]*\/_next\/static\/[^" ]+)"/g)) assets.add(match[1].replaceAll("&amp;", "&"));
    }
    assert.ok(assets.size > 0, "HTML must reference bundled assets");
    let scripts = 0, styles = 0;
    for (const asset of assets) {
      const response = await fetch(new URL(asset, origin));
      assert.equal(response.status, 200, asset);
      const type = response.headers.get("content-type") || "";
      if (asset.endsWith(".js")) { scripts++; assert.match(type, /javascript/); }
      if (asset.endsWith(".css")) { styles++; assert.match(type, /text\/css/); }
      assert.ok((await response.arrayBuffer()).byteLength > 0, asset);
    }
    assert.ok(scripts && styles, "JavaScript and CSS must both be served");
    for (const path of ["/trade", "/terminal"]) {
      const response = await fetch(origin + path, { redirect: "manual" });
      assert.equal(response.status, 307);
      assert.equal(new URL(response.headers.get("location"), origin).pathname, "/stocks");
    }
    assert.equal((await fetch(origin + "/this-route-does-not-exist")).status, 404);
    console.log(JSON.stringify({ smoke: "passed", routes: 3, assets: assets.size, scripts, styles, redirects: 2, unknownRoute: 404 }));
  } finally {
    stop();
    if (server && server.exitCode === null) await new Promise(resolve => server.once("exit", resolve));
    if (runtime) rmSync(runtime, { recursive: true, force: true });
    process.removeListener("exit", stop);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
