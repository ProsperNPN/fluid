# Smart blood inventory

FLUID now tracks individual physical units beneath its existing inventory batches. Hospital authentication, verification, memberships, request publication, appointments, SSE notifications and the existing worker are retained. Appointment completion never inserts usable stock. Intake, testing, clinical release, allocation and issue are separate, recorded actions.

## Start locally

From `backend`, install the updated requirements and migrate:

```powershell
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe -m alembic upgrade head
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Run the existing worker in another terminal:

```powershell
.venv/Scripts/python.exe -m app.scripts.run_alert_worker
```

The worker now monitors inventory as well as emergency requests and appointment reminders. It checks every 10 seconds; `--once` performs one bounded tick. Deploy it under a supervisor with the same PostgreSQL configuration as the API. No new provider credentials are required for inventory alerts. They use persistent in-app notifications and the existing authenticated SSE/polling system.

The frontend adds `@zxing/browser` for QR decoding. The backend adds `qrcode` for real SVG QR generation. Run `npm install`, then the existing frontend start/build commands.

## Clinical configuration required before release

In **Hospital → Inventory → Component policies**, a hospital administrator or blood bank manager must enter and attest to the facility's professionally reviewed component policy:

- Applicable standard/SOP reference and processing/storage requirements.
- Maximum shelf life in hours as a validation cap.
- Permitted storage temperature bounds.
- Expiring-soon warning lead time (operational default: 168 hours).
- Explicit clinical-policy approval and authorization.

FLUID provides **no default clinical shelf-life or temperature rules**. These differ by preparation, processing, storage system, product instructions and applicable jurisdiction. Each unit's actual expiration must come from its verified official label and applicable SOP. A component-level cap is not a complete processing-specific rules engine. Changing a policy can quarantine units that no longer meet its conditions; it never automatically releases stock.

Release requires passed testing, reconciled official donation/product identifiers, recorded collection and expiration times, verified cold-chain conditions, an in-range recorded temperature, official-label verification and explicit human clinical authorization. A passed testing flag alone cannot make a unit available. The facility remains responsible for laboratory results, crossmatching, temperature monitoring, storage equipment, recall investigation and clinical transfusion decisions. This application does not continuously measure temperature or declare a unit safe for transfusion.

Existing roles are reused: verified `hospital_staff`, `blood_bank_manager` and `hospital_admin` can view inventory and perform permitted operational actions. Only administrators/managers can attest to clinical policies, verified testing results, clinical release, issue, recall or disposal. Facilities must assign these roles only to appropriately authorized staff.

## Physical-unit workflow

1. **Receive inventory** records blood group/Rh, component, official identifiers when known, collection/expiration timestamps and storage. Quantity one is one physical unit. Bulk intake (up to 100 units per request) preserves exact timestamps and creates distinct internal identifiers in quarantine; reconcile each official label separately before release.
2. **Edit** is permitted only in quarantine/testing with a reason and clinical authorization. Identity/expiration corrections reset testing and release status. Used, discarded and expired units cannot be edited back into available stock.
3. **Start testing**, then **Record testing**. Failed testing returns the unit to quarantine. Passed testing still requires a separate **Clinical release** action.
4. **Reserve** requires current clinical release, compatibility-review confirmation, and an active hospital-owned request with a compatible blood group and the same component. The existing component compatibility rules are reused as referral/validation guards, not a substitute for clinical crossmatching.
5. **Unreserve** releases an allocation; it does not create a new clinical release. Closed requests are automatically unreserved by the monitor if the unit remains valid.
6. **Use** records an authorized, verified issue after compatibility confirmation. It consumes either available or appropriately reserved stock. It does not automatically increment request fulfillment, avoiding double counting with the existing request/donation workflows.
7. **Move** records destination and verified transport/storage conditions. An out-of-range or missing required temperature quarantines previously released stock and clears its reservation. No released unit is silently carried through an invalid storage change.
8. **Quarantine**, **Recall**, and **Discard** retain their history. Recall resets non-used units for renewed testing/review. Re-release requires explicit recall resolution. A recall of an already used unit preserves its used status and flags clinical follow-up; it never puts the unit back into stock.

Expiration uses timezone-aware timestamps and an exclusive boundary: at `expires_at`, allocation and availability stop immediately, even before the worker marks the stored status expired. Expired stock can be disposed of with authorized confirmation. Collection cannot be in the future, and expiration must follow collection. Missing dates or release evidence always block allocation.

## Dashboard and replenishment

The dashboard shows clinically available/unreserved units, reservations, shortages by blood group **and component**, low/critical conditions, expiring stock, and 30 days of recorded stock movements. Search covers internal/official identifiers and storage; filters cover blood group, component and lifecycle status, with sorting and pagination.

Minimum and critical thresholds apply once per hospital/blood-group/component combination, not once per batch. Stock alerts are emitted on condition transitions; recurring scans do not repeat the same alert. Expiration and recall alerts have durable per-unit state. All active authorized hospital operators receive in-app alerts. SSE revisions also include units and policies, so sessions synchronize independently of notification read state.

**Request shortage** opens the existing Blood Requests form with blood group, component and shortage quantity prefilled. It also shows current clinically available stock. Hospital staff must review and publish; no emergency request is automatically issued. Quantities exceeding the existing request limit must be split/reviewed within that workflow.

## QR codes and official labeling

FLUID's SVG QR encodes only `fluid:inventory:<opaque UUID>`. It contains no donor identity, patient data, blood group or testing information. Scanning calls an authenticated tenant-scoped endpoint; another hospital receives 404. There is no public unit lookup endpoint. QR downloads require authentication.

Staff can opt into camera scanning, upload a QR image, or enter the internal code/payload manually. Camera permission starts only after **Start camera**. Stop, closing the dialog and unmounting end video tracks. Camera use requires localhost or HTTPS and browser/device permission; manual lookup and image upload remain available when hardware or permission is unavailable.

Official donation identifiers, product codes (including division where applicable) and label standards are stored separately. ISBT 128 input checks normalized identifier/product-code shapes; FLUID does not generate official identifiers, replace official barcodes, validate facility registration/product catalogs/check characters, or claim ISBT 128 certification. Continue using the establishment's licensed/approved labeling system and its official traceability records. An isolated DIN barcode alone may identify several derived products; use the full official donation/product pair or FLUID's internal QR for a specific unit.

References requiring local professional interpretation: [ICCBBA ISBT 128 labeling specification](https://iccbba.org/wp-content/uploads/2025/08/1a7593_61f3f47e2d9e4eda8e86611a58db4833.pdf), [WHO blood cold-chain guidance](https://www.who.int/publications/i/item/WHO-EHT-11.04), and [Canadian Blood Services labeling guidance](https://professionaleducation.blood.ca/en/transfusion/best-practices/canadian-guidelines-uniform-labelling-blood-and-blood-components-using-isbt-128). These references are not deployed clinical rules.

## Database, audit and concurrency

Migration `20261018_0016` adds `inventory_units`, component/stock policies, durable alert states and `inventory_movements`. Existing batch records remain, with clinically released counts recalculated from unit records. Unit status/release prerequisites, internal identifiers and per-hospital official donation/product pairs have database constraints.

Movement records are append-only through a PostgreSQL trigger rejecting updates/deletes. They include actor/system attribution, reason, status/storage/identifier snapshots, stock delta, attestation flags and release-policy context. Human changes also enter the existing global audit log. Unit history never exposes donor/patient records. Database administrators retain privileged maintenance authority; use least-privilege application credentials, appropriate backups and institutional retention controls.

Mutations serialize hospital inventory changes with row locks, use request-before-facility lock ordering for allocations, and require unit revisions. A stale action returns 409. Official-identifier conflicts return 409. Failed transactions roll back physical movements and audit entries together. Available-stock calculations always exclude untested, unreleased, quarantined, recalled, expired, used and discarded units. Legacy batch APIs remain available but cannot bypass release controls: added quantities enter quarantine, and allocations/issues operate on real eligible units.

Legacy aggregate stock has no release evidence or individual official identifiers. Migration preserves the reported quantity as quarantined reconciliation records and retains original available/reserved counts in `blood_inventory.legacy_reported_counts`; former reservations require physical and clinical reconciliation. It does not invent official identifiers or infer testing/approval. A downgrade is blocked once new physical movements exist, so traceability cannot silently disappear.

## Main implementation files

- `backend/app/models/inventory_unit.py`, `schemas/inventory_unit.py`, `services/smart_inventory.py`.
- `backend/app/api/v1/endpoints/inventory_units.py` and the retained batch compatibility API `inventory.py`.
- `backend/alembic/versions/20261018_0016_smart_inventory.py`.
- Existing workspace analytics, notification revision state and background worker integrations.
- `frontend/app/hospital/inventory/page.tsx`, `components/portal/inventory-scanner.tsx`, `services/smart-inventory-service.ts`, and shortage-prefill integration in Blood Requests.

## Validation

Backend tests use disposable PostgreSQL schemas and synthetic policies/identifiers. They cover intake/editing, exact bulk timestamps, testing/release gates, movement history immutability, duplicate identifiers, stock thresholds and alert deduplication, expiration, recall/disposal, storage deviations, allocation/issue, concurrent updates, role enforcement, cross-hospital isolation and migration preservation of legacy quantities.

Run `python -m pytest` in `backend`, then `npx tsc --noEmit`, `npm run lint` and `npm run build` in `frontend`. Browser QA uses isolated synthetic hospital data, real authenticated APIs, generated SVG QR decoding, camera start/stop with a synthetic media device, clinical movement forms, live multi-session updates, shortage request prefill and a 390px mobile viewport. A physical camera, production HTTPS proxy and institutional clinical/labeling integration require deployment-specific validation.
