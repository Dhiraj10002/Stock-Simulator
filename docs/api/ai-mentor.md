# AI Trading Copilot

`POST /api/v1/ai/analyze-trade` is authenticated. The Go backend sends the
question and a bounded account snapshot to Gemini Generate Content; API keys
stay on the server. Short questions such as `stocks` are accepted; blank or
more than 2,000-character questions are rejected.

```json
{"question":"Explain my portfolio concentration"}
```

Responses preserve `answer` and add explicit source metadata:

```json
{"success":true,"data":{"answer":"...","source":"gemini","model":"gemini-3.7-flash"}}
```

```json
{"success":true,"data":{"answer":"...","source":"rule_based","fallback_reason":"rate_limited"}}
```

The UI labels rule-based fallback honestly. The backend returns only safe reason
codes: `not_configured`, `invalid_model`, `request_rejected`,
`authentication_failed`, `model_unavailable`, `rate_limited`, `timeout`,
`network_error`, `provider_unavailable`, `invalid_response`, `empty_response`,
`incomplete_response`, or `blocked`. Raw provider errors, prompts, credentials
and account data are not logged. A 400 can indicate a bad key or unsupported
request/model configuration; the operator must check the Google project privately.

## Configure and verify Gemini

### Response style and financial wording

Chat instructions target 60–120 words and up to three bullets by default;
greetings use one or two sentences, and explicit requests for detail may be
longer. Audit narratives target at most 120 words without repeating the
scorecard. These are model instructions, not hard truncation limits or a
guarantee of accuracy. The UI keeps its persistent educational notice;
generated responses should include claim-specific limitations instead of
repeating a generic disclaimer.

General explanations should not insert personal account figures unless asked.
Account responses distinguish virtual money and simulated holdings from real
market data, available cash from blocked margin, and concentration in gross
open-position marked value from total account-equity allocation. Zero blocked
margin is not proof of zero market risk or margin-call safety. Recent orders
alone do not establish fills or completed round trips. Stored values may be
stale and concentration can fall back to entry cost for zero marked values.

Local welcome/reset/status messages have no provider-source badge. Server
responses retain Gemini/fallback labels; missing server metadata still shows
`Response source unavailable` rather than being disguised as a local message.

### Production configuration

Local development: set `backend/.env`. Oracle production: set the root `.env`
(or the existing `PRODUCTION_ENV_FILE`) used by the backend's Compose `env_file`.
Never put the key in frontend variables or paste it into an issue/chat.

```env
GEMINI_API_KEY=your-secret-key
GEMINI_MODEL=gemini-3.7-flash
```

`GEMINI_MODEL` can be an available Gemini Generate Content model; a `models/`
prefix and surrounding whitespace are normalized. Changing an env file alone
does not change a running container: recreate the backend through the existing
production Compose files, including the Oracle overlay and secret env file.
Do not switch database URLs or rebuild/recreate PostgreSQL for this change.

After updating/rebuilding the backend, run on Oracle:

```bash
cd /home/ubuntu/stock-simulator-prod
python3 scripts/check_gemini.py --sudo-docker
```

This reads the running container's config privately and sends one fixed test
prompt with no account information. It consumes one Gemini request and prints
only `working`, configuration presence, the validated model, HTTP status and
safe reason. Share only that final JSON. `working: true` verifies provider access;
it does not certify answer quality. A missing key requires configuring the key
privately on the VM, not a code change. A model unavailable to that project
requires an accessible `GEMINI_MODEL`. Quota/authentication failures are distinct
from network failures. The probe runs from the host, so if it passes but the app
reports a network failure, inspect backend-container egress separately.

## Behavior and limits

- One shared client implements chat and audit generation, with header auth,
  REST field names, a 20s request deadline, bounded response size, concatenated
  non-thought answer parts, and explicit handling of blocked/truncated output.
  Gemini 3 uses low thinking; the browser allows 35s for request processing.
- An audit/critique chat command requests only `/ai/trade-critique`, not an
  additional general chat response. Repeated audit clicks are coalesced.
- Go computes audit metrics and scores. Their narrative identifies them as
  heuristics. Rapid order clustering cannot prove revenge trading. The displayed
  positive-realized-position percentage is not a per-trade win rate, and is N/A
  without non-zero realized position outcomes. The sample is at most 50 orders;
  an empty order sample displays no earned discipline grade and uses a local
  review (`insufficient_history`) without asking Gemini to invent one.
- Account context failures do not manufacture a virtual balance or clean audit.
  Audits fail when records are unavailable. Concentration uses gross marked
  open-position value excluding cash; it is not account-equity allocation or
  complete derivative exposure. Stored marks may be stale.
- Fallback answers do not invent news, prices, stock rankings, fixed lot sizes,
  expiry weekdays, or guaranteed hedges. MIS policy starts at 15:20 IST and
  retries until 15:30, subject to executable quotes.
- Messages and audit narratives render Markdown without executing HTML or
  loading remote images. Network failures show an unavailable notice rather
  than a fabricated assessment. No continuous monitoring is implied.

## Deploy this fix on the existing Oracle installation

After merging the PR, run in the Oracle checkout. The backend image must be
rebuilt; frontend changes deploy through the existing Vercel integration.

```bash
cd /home/ubuntu/stock-simulator-prod
git pull --ff-only origin main
sudo -n docker compose --project-directory . --env-file .env --env-file .env.oracle-db \
  --profile oracle-db -f docker-compose.prod.yml -f deploy/oracle/docker-compose.postgres.yml \
  up -d --build --no-deps backend
python3 scripts/check_gemini.py --sudo-docker
```

This rebuilds/recreates only the backend. Keep the existing Oracle DATABASE_URL
and secret env file. If the probe reports `not_configured`, edit `GEMINI_API_KEY`
privately in the production env file and recreate the backend again. Do not print
or share the file. If a model is inaccessible, choose an enabled Generate Content
model from the same Google project and update `GEMINI_MODEL` before recreation.
