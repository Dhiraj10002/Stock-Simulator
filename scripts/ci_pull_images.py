#!/usr/bin/env python3
"""Pull CI's official base images without depending on one public registry."""

import argparse
import subprocess
import sys


CI_IMAGES = frozenset({
    "postgres:16-alpine", "redis:7-alpine", "caddy:2-alpine",
    "debian:bookworm-slim", "node:22-alpine",
})
REGISTRIES = ("docker.io/library/", "public.ecr.aws/docker/library/")


def pull_image(image):
    if image not in CI_IMAGES:
        raise ValueError("unsupported CI base image")
    cached = subprocess.run(
        ["docker", "image", "inspect", image],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15,
    )
    if cached.returncode == 0:
        print(f"Using local {image}", flush=True)
        return

    for registry in REGISTRIES:
        source = registry + image
        print(f"Pulling {source}", flush=True)
        try:
            result = subprocess.run(["docker", "pull", source], timeout=120)
        except subprocess.TimeoutExpired:
            print(f"Pull timed out: {source}; trying the next registry", flush=True)
            continue
        if result.returncode != 0:
            print(f"Pull failed: {source}; trying the next registry", flush=True)
            continue
        # Compose, Dockerfiles and the isolated restore verifier use this tag.
        subprocess.run(["docker", "tag", source, image], check=True, timeout=15)
        return

    raise RuntimeError(f"All configured registries failed for {image}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("images", nargs="+", choices=sorted(CI_IMAGES))
    args = parser.parse_args()
    try:
        for image in args.images:
            pull_image(image)
    except (RuntimeError, subprocess.SubprocessError, OSError) as exc:
        print(f"::error::{exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
