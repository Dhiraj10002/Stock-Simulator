# Worker startup and failed-update recovery — 4 October 2026 IST

## Why localhost refused the connection

The supplied 01:38–01:42 IST terminal log shows this sequence:

1. `git pull --ff-only` aborted because a local edit to `scripts/smoke_test_live_session.py` would be overwritten. The checkout remained on the older code.
2. The pasted commands still restarted services. The old expiry job continued loading 72,601 complete instrument rows; the distinct-expiry fix was never applied locally.
3. Backend schema verification succeeded and HTTP health returned 200.
4. The market worker did not expose HTTP health within the launcher's 180-second limit. The frontend was never started; owned services were then stopped.
5. The subsequent smoke request hit a stopped backend and reported connection refused. The browser's `ERR_CONNECTION_REFUSED` is consistent with no frontend listener on port 3000.

The log does not prove an incorrect Angel One password, a firewall problem or a frontend rendering crash. No broker error is included before timeout. The precise blocking call on the user's computer is unobserved, but source review confirms health was opened only after canonical-master loading and broker initialization, both of which can block.

PR #8 was merged to main at `af6ce1db8c15ec51b3741ddf2a2db5cadf8463ac`. Its expiry, display and smoke-report fixes are already included in the new `codex/worker-startup-liveness-20261004` branch.

## Additional correction

- Bind the worker health listener before Redis alias lookup, canonical master loading or broker authentication.
- Start the worker heartbeat before the initial master load/login and initialize the LIVE feed as unavailable.
- Keep `/ready` false until the provider reports `LIVE` and the master/heartbeat requirements pass; a listening process is not proof of quotes or executable trading.
- Exit promptly if the health listener cannot bind. The launcher still detects actual child exits and failed health probes.
- Keep authentic quote/master validation and the existing backend OPEN-session freshness checks. No synthetic fallback or longer launch timeout is introduced.

Four regressions cover real loopback health/ready/quote requests while master loading or login is deliberately blocked, missing-listener failure, and non-LIVE provider readiness. The existing full-stack launcher tests continue to cover health gates and owned-process cleanup.

## Preserve the local edit and apply the update

Run this from the Fedora repository in **terminal 1**. The targeted stash saves the smoke-script edit locally. It does not publish it or include `.env`. Review other changes with `git status --short` before proceeding; Git will retain or refuse conflicting edits rather than discard them.

```bash
git stash push -m "backup-local-smoke-edit-20261004" -- scripts/smoke_test_live_session.py &&
git fetch origin &&
git switch codex/worker-startup-liveness-20261004 &&
git pull --ff-only origin codex/worker-startup-liveness-20261004 &&
./stop.sh &&
./start-dev.sh
```

The `&&` chain stops if any update step fails, so services cannot restart an old checkout after an aborted pull. Leave `./start-dev.sh` running: it owns the services and Ctrl+C stops them. Do not put smoke verification immediately after this foreground command in the same terminal.

Keep the stash until the saved edit has been reviewed. The updated script already contains the explicit missing-future guard; blindly restoring the old edit can reintroduce conflicts. `git stash list` shows the retained backup. If other local changes block switching branches, preserve those changes first and rerun the update; do not use `git reset --hard` or discard the edit.

## Verify from terminal 2

Wait for the launcher to print that the frontend/platform processes are available, then open `http://localhost:3000` and inspect:

```bash
curl --silent http://localhost:8085/health
curl --silent http://localhost:8085/ready
curl --silent http://localhost:8080/api/v1/ready
python3 scripts/smoke_test_live_session.py --output closed-session-evidence.json
```

While initialization is pending, worker `/health` should respond 200, `/ready` should return 503 and the website should show explicit unavailable data. Provider readiness can later recover; it is separate from frontend liveness. Backend readiness must also check canonical versions, heartbeat and exchange state.

After updating, the old `SELECT *` expiry scan should disappear. Remaining remote DB latency, master download time or provider failures require the new log/readiness diagnostics; increasing a timeout alone does not certify live market data.

This remains a Sunday closed-session recovery. [Issue #9](https://github.com/Dhiraj10002/Stock-Simulator/issues/9) requires real OPEN-session quote/chart/F&O/paper-account evidence before completion. See [the broader closed-session review](CLOSED_SESSION_REVIEW_2026-10-04.md) for the full test commands and remaining findings. User credentials and raw screenshots are excluded from this report and code changes.
