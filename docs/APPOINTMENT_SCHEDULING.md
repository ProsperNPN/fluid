# Blood donation appointments

Appointments extend FLUID's existing accepted donor referrals, hospital authorization, donation records, notifications, and SSE/polling synchronization. Scheduling never establishes medical eligibility. Check-in is attendance only. Completed donation records require authorized staff to explicitly confirm clinical checks, an actual procedure, and collected units. Inventory intake/testing/release remains a separate workflow.

## Setup and operation

1. Apply migrations from `backend`: `.venv/Scripts/python.exe -m alembic upgrade head`.
2. Run the existing API and frontend. A verified hospital administrator opens **Appointments → Hours & capacity**, selects an IANA time zone, operating windows, slot duration, capacity, reminders, and hospital-approved preparation instructions. Availability starts disabled; no operating hours are invented for an existing hospital. Staff can coordinate appointments but only hospital administrators can save availability.
3. Keep the existing background worker running: `.venv/Scripts/python.exe -m app.scripts.run_alert_worker`. It now handles appointment reminders as well as emergency alerts and request expiration. `--once` performs one bounded tick. Deploy it under a process supervisor, using the same database and configuration as the API.
4. No new API keys are needed. The `tzdata` dependency supplies IANA time-zone data on Windows and minimal containers. Directions open Google Maps only when selected, using the hospital/request coordinates or hospital address; donor GPS is not included. Calendar downloads use UTC iCalendar events with escaped text and UTF-8 line folding.

The worker generates persisted **in-app** appointment reminders, independently of the emergency email/SMS channels. Hospital administrators configure the lead times (24h and 2h by default; API supports 1–168h). Donors' existing appointment-notification preference is respected. No email or SMS appointment delivery is claimed by this implementation.

## Coordinating a donation

- A donor accepts an invitation by expressing availability; the referral becomes pending hospital review. A verified hospital can propose an appointment for that referral. Existing hospital approval also continues to create an unscheduled coordination record, preserving the original workflow.
- Hospital **Appointments → Propose appointment** selects the referral and a real available slot. Existing appointment cards support the same operation. The slot becomes reserved and the donor sees a pending hospital proposal.
- The donor can confirm, decline/cancel, or request a different available slot. A donor's time proposal requires hospital confirmation. Every time change resets both confirmation states and requires the other party's consent. A proposing party cannot confirm its own proposal.
- Donors can save preferred time windows in their own IANA time zone. These rank suggested slots; other available times remain selectable. Search results respect facility capacity, donor conflicts, operating hours, request urgency/deadline, availability, accepted invitation state, and withdrawn matching consent.
- Confirmed appointments offer `.ics` calendar downloads. Both portals show device-local time and the hospital's time zone. Hospital list/calendar views include status, date, name, and request filters, pagination, and appointment history. The calendar explicitly identifies the current page; select a day to focus its entries.
- Authorized hospital operators can check in a confirmed donor from 30 minutes before the slot through two hours after its end. A no-show can be recorded only after the end plus a 15-minute grace period. Neither action records a donation.
- Staff record completion only after check-in, confirming clinical checks, the actual procedure, and actual units. Request fulfillment and existing donor history/analytics update in one transaction. Overfilling the request is rejected rather than silently clamped. A procedure that did not complete can be cancelled by hospital staff with a reason; no donation history is created.

## State transitions

| Current state | Allowed actions |
| --- | --- |
| Pending, no time | Propose an available time; cancel |
| Pending time proposal | Other party confirms; either party reproposes or cancels |
| Confirmed | Repropose time, cancel, staff check-in near the visit, staff no-show after the grace period |
| Checked in | Staff-confirmed donation completion, or staff cancellation with a reason when no donation occurred |
| Completed / cancelled / no-show | Read history and permitted records; no further mutation |

Closed/expired requests cancel pending and confirmed appointments, release reservations, and record system history. A donor already checked in is not automatically marked as a failed or successful donation; staff must record the actual outcome. A checked-in procedure can complete after request expiration, but not after request cancellation or overfilled fulfillment.

## Consistency, privacy and concurrency

- The existing `appointments` table remains the donation record. New fields record proposal ownership, confirmations, interval, hospital zone, instructions, cancellation reason, check-in, completion actor, and revisions.
- `appointment_policies` stores explicit hospital availability. `appointment_occupancy` reserves each occupied minute. Unique `(donor, minute)` and `(hospital, minute, seat)` constraints prevent cross-hospital donor conflicts and capacity conflicts. Times use exact-minute boundaries and fixed slot durations. No new PostgreSQL extension or elevated database extension permission is required.
- Mutations use consistent request/facility/donor/appointment locking. The UI sends `expected_version`; stale submissions receive 409. Existing API clients can omit it for compatibility, but should adopt revisions for lost-update detection.
- Rescheduling replaces old reservations atomically. Cancellation/completion/no-show releases them. Availability changes are rejected if they invalidate existing future intervals or reduce capacity below reserved seats. Pausing new bookings preserves existing confirmed visits.
- `appointment_events` is append-only participant history with one row per revision. Human changes also use the existing global audit log. Automatic request-driven cancellations have a null system actor in appointment history; they are never attributed to a fabricated user. Private hospital notes are omitted from donor responses and history.
- `appointment_reminders` uniquely identifies appointment/schedule revision/lead time. Request locks and database uniqueness prevent duplicate jobs across workers. After downtime, only the nearest due threshold is sent, avoiding bursts of stale reminders. Rescheduling creates a new reminder revision. Cancelled, expired-request, checked-in, completed, or past appointments receive no reminders.
- The existing authenticated SSE state includes appointment revisions, so both dashboards synchronize even when a donor suppresses appointment notifications. Notification history remains persistent; the 15-second polling fallback still works.

## Migration notes

Migration `20261018_0015` preserves appointment IDs, request links, and completed records. Existing confirmed appointments retain their UTC times and reserve an inferred 30-minute interval; this duration was not stored previously. Existing pending records require a fresh time proposal. Legacy `missed` becomes `no_show` (the API still accepts the old action alias).

If existing future confirmed donor appointments overlap at the one-minute reservation granularity, the occupancy uniqueness constraint stops the migration and the transaction rolls back. Reconcile those real bookings before retrying; the migration never silently deletes, cancels, or moves them. Back-to-back legacy bookings with partial-minute times may require the same reconciliation. A downgrade removes new coordination data and maps checked-in records back to confirmed; do not downgrade a live coordination system without reviewing active visits.

## Validation

Tests use disposable PostgreSQL schemas and never record test activity against application accounts. They cover the complete proposal → donor confirmation → reminder → check-in → explicit completion workflow; zero inventory intake on completion; capacity and donor conflicts; atomic rescheduling/cancellation; stale concurrent updates; preferences, time-zone/DST handling, date filters; unauthorized and unverified accounts; expiry; no-shows; reminder idempotence; and migration upgrade/downgrade.

Run `python -m pytest` in `backend`, then `npx tsc --noEmit`, `npm run lint`, and `npm run build` in `frontend`. Browser validation uses separate hospital/donor sessions, real API calls and PostgreSQL, authenticated live updates, `.ics` download, rescheduling, calendar/list views, reminders, check-in/completion, history, and a 390px mobile layout.

Primary format references: [iCalendar RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545) and [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started).
