import subprocess
import unittest
from unittest.mock import patch

from ci_pull_images import pull_image


def result(code):
    return subprocess.CompletedProcess([], code)


class RegistryFallbackTest(unittest.TestCase):
    @patch("ci_pull_images.subprocess.run")
    def test_rate_limit_falls_back_and_tags_for_restore_and_builds(self, run):
        run.side_effect = [result(1), result(1), result(0), result(0)]
        pull_image("postgres:16-alpine")
        self.assertEqual(run.call_args_list[1].args[0],
                         ["docker", "pull", "docker.io/library/postgres:16-alpine"])
        self.assertEqual(run.call_args_list[2].args[0],
                         ["docker", "pull", "public.ecr.aws/docker/library/postgres:16-alpine"])
        self.assertEqual(run.call_args_list[3].args[0],
                         ["docker", "tag", "public.ecr.aws/docker/library/postgres:16-alpine",
                          "postgres:16-alpine"])

    @patch("ci_pull_images.subprocess.run")
    def test_all_registries_unavailable_fails_instead_of_skipping_tests(self, run):
        run.side_effect = [result(1), result(1), result(1)]
        with self.assertRaisesRegex(RuntimeError, "All configured registries failed"):
            pull_image("redis:7-alpine")

    @patch("ci_pull_images.subprocess.run")
    def test_hung_registry_is_bounded_and_falls_back(self, run):
        run.side_effect = [result(1), subprocess.TimeoutExpired("docker pull", 120),
                           result(0), result(0)]
        pull_image("node:22-alpine")
        self.assertEqual(run.call_args_list[1].kwargs["timeout"], 120)
        self.assertEqual(run.call_args_list[2].kwargs["timeout"], 120)

    @patch("ci_pull_images.subprocess.run")
    def test_local_image_avoids_another_registry_pull(self, run):
        run.return_value = result(0)
        pull_image("postgres:16-alpine")
        self.assertEqual(run.call_count, 1)

    @patch("ci_pull_images.subprocess.run")
    def test_tag_failure_is_fatal(self, run):
        run.side_effect = [result(1), result(0),
                           subprocess.CalledProcessError(1, "docker tag")]
        with self.assertRaises(subprocess.CalledProcessError):
            pull_image("debian:bookworm-slim")

    @patch("ci_pull_images.subprocess.run")
    def test_unsupported_images_are_rejected_before_docker_runs(self, run):
        with self.assertRaises(ValueError):
            pull_image("untrusted.example/postgres:latest")
        run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
