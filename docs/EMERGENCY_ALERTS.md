# Emergency blood alerts

FLUID reuses its verified hospital requests, component-aware referral matching, GPS records, donor consent, invitations, appointments, and authentication. Expressing availability creates a pending response for hospital review. It never clears a donor medically or records donated units.

## Run locally

From `backend`, using the existing virtual environment:

```powershell
.venv/Scripts/python.exe -m alembic upgrade head
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In a separate terminal, run the durable worker:

```powershell
.venv/Scripts/python.exe -m app.scripts.run_alert_worker
```

The API creates in-app alerts transactionally when a request is published. The worker checks active emergency requests every 10 seconds for new potential donors, expires requests, and processes delivery jobs. `--once` performs one bounded tick. Deploy the worker as a supervised process with the same PostgreSQL and matching policy configuration as the API; do not run it as a request handler or browser timer. Multiple workers use PostgreSQL request locks and outbox `SKIP LOCKED` claims.

Start the frontend normally with `npm run dev`, or `npm run build` followed by `npm run start`.

## Configuration

All secrets belong in the existing environment configuration, never frontend variables or source control.

| Variable | Default / meaning |
| --- | --- |
| `DONATION_POLICY_APPROVED` | `false`; matching and automated referral alerts stay disabled until the existing clinical policy is approved by the responsible clinical team |
| `ALERT_EMAIL_ENABLED` | `false`; explicitly enables SMTP emergency sending |
| `SMTP_HOST`, `SMTP_PORT` | Existing SMTP service, port defaults to 587; requires STARTTLS |
| `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL` | Existing SMTP credentials and verified sender |
| `ALERT_SMS_ENABLED` | `false`; explicitly enables Twilio SMS |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | Twilio account credentials and authorized sender |
| `ALERT_ESCALATION_WAIT_SECONDS` | `300`; hospital must wait between radius expansions |
| `ALERT_RETRY_LIMIT` | `4`; maximum initial-send attempts, with exponential backoff |
| `FRONTEND_URL` | Public frontend origin used for notification links |
| `CORS_ORIGINS` | Must include the exact frontend origin for authenticated browser SSE |

Donors separately opt into matching, urgent notifications, and each external channel in **Availability**. Email/SMS options default off for existing and new accounts. SMS requires an international E.164 phone number (for example `+233…`). Configuring a provider does not override donor consent. Disabled channels are marked `skipped`; enabling a channel later does not automatically replay old emergency messages.

## Verify the workflow

1. Use a verified hospital and a consenting, available donor with potentially compatible blood/component information, saved coordinates within 10 km, and no known policy exclusion. An approved clinical referral policy is required for live matching; tests enable it only inside isolated fixtures.
2. Hospital **Blood Requests**: publish an urgent or critical request with location, quantity, and future required-by/expiration dates.
3. Donor **Overview** or notification bell: a persisted emergency card shows hospital, blood/component, urgency, approximate distance and deadline. Select **I'm Available to Donate** or **Decline**.
4. Hospital **Emergency Coordination**: see in-app notified counts, responding donors, availability/decline counts, approximate distances, response timestamps, and per-channel job states. **Review responses** opens the existing Donor Matches workflow for screening coordination, messages and appointments.
5. If fewer than five availability responses arrive, a hospital operator can approve the next 25/50/100 km expansion after the waiting period. This is an outreach threshold, not a medical estimate of how many donors or units are needed. Each donor's consent and preferred radius still apply.
6. Edit active request details from **Blood Requests**. Blood group/component changes require a new request. Updating an alert refreshes its existing card without another initial alert. Cancel, expiration, or confirmed-unit fulfillment stops further outreach and cancels unsent jobs. Only actual recorded units can fulfill a request.

## Reliability and delivery semantics

- `emergency_alerts` uniquely records each request/donor pair. Deleting a notification, refreshing, rescanning, and expanding the radius cannot recreate that alert. `donor_responses` and channel jobs also have unique constraints. Request/profile locks and stable donor lock ordering protect concurrent fanout.
- Notifications persist in PostgreSQL with read/unread history and pagination. `/api/v1/notifications/stream` uses a bearer-authenticated `fetch` stream: tokens never appear in URLs. Events contain only a revision and unread count. The frontend fetches authorized content through normal APIs.
- Streams check for committed changes every two seconds, rotate at most every 90 seconds (or token expiry), reconnect with backoff, and stop on logout, hidden tabs, offline state, and unmount. A visible tab polls state every 15 seconds as fallback. All portal queries refresh on a live-update event. The bell shows connection status on desktop and in its accessible title.
- Reverse proxies must disable SSE buffering/caching and allow streaming connections. Example Nginx settings for the stream route: `proxy_buffering off; proxy_read_timeout 120s;`. Use HTTPS for deployment. The implementation is origin-independent; this session validated local HTTP, not a deployed HTTPS proxy.
- The worker revalidates request state, current hospital verification, active donor, matching, availability, consent and response status before external submission. Already responding donors do not receive unsent initial emails/SMS. An external provider submission and a subsequent database cancellation cannot be made atomic: a message already in flight cannot be recalled.
- SMTP success means **accepted**, never **delivered**. Twilio queued/sent states mean **accepted**; the worker polls the authenticated provider API and marks **delivered** only on its delivered status. Receipt polling stops after 24 hours with `unknown` if confirmation remains unavailable.
- Safe pre-submission/transient failures retry with backoff. Permanent failures are `failed`. Ambiguous submissions and expired processing leases are `unknown` and are never blindly resent. An operator must inspect provider records before manually recovering those jobs; there is no public retry/admin bypass endpoint.
- Errors are stored as safe codes and logged with delivery IDs, excluding addresses, message bodies, credentials, or provider responses. SMTP has no delivery-receipt integration in this implementation. Do not treat in-app publication, SMTP acceptance, or an invitation acceptance as proof of delivery or completed donation.
- Verified operators are tenant-scoped; emergency publication is limited to 10 requests per hospital per 10 minutes, expansion is time-limited and audited, and live connections are limited to five per user per API process. Apply deployment-wide edge rate limits when scaling multiple API processes. No donor GPS coordinates are returned to hospitals; revoked sharing suppresses distances in emergency response details.

## Validation

Backend tests use disposable PostgreSQL schemas. Provider tests intercept all network submission and never send emergency messages. Tests cover publication, initial/expanded radii, consent and compatibility exclusions, acceptance/decline, duplicates/concurrency, persisted notifications, offline SSE catch-up, access control, expiry/cancellation/fulfillment, request edits, consent revocation before sending, retry/ambiguous failure handling, and provider delivery confirmation. Run `python -m pytest` from `backend`.

Frontend validation: `npx tsc --noEmit`, `npm run lint`, and `npm run build`. Browser validation used separate hospital/donor sessions against an isolated local PostgreSQL schema, real authenticated SSE, acceptance/decline, hospital synchronization, offline reconnection, refresh persistence, blocked-stream polling fallback, and a 390px mobile viewport. No application accounts or real provider recipients were used.
