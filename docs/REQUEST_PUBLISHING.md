# Hospital blood request publishing

The request form reuses the authenticated hospital's saved address and coordinates. Staff do not enter latitude or longitude. If the facility pin is missing, open **Set hospital location**, use GPS or address search/map selection, review the address, and confirm. This uses the existing location API and its administrator permission and relocation verification rules. Moving a verified facility can still require verification review.

**Publish Request** publishes a new request directly; **Save Draft** retains an incomplete request for later. When editing a draft, **Save & Publish** saves the reviewed details and publishes that same record. The hospital profile is refreshed whenever the dialog opens, so reopening cannot silently reuse a stale facility pin.

Publishing requires a valid blood group, component, 1–100 whole units, urgency, location pin, and future required-by/expiration timestamps. Expiration must be on or before the required-by time: it determines when donor responses stop. Drafts may omit the deadlines and pin. Incomplete requests must be edited before publication.

The API resolves an omitted address/pin from the authenticated hospital before validating publication, for both direct creation and draft publication. Partial coordinate pairs and invalid saved coordinates are rejected. Dates and location failures return field-specific HTTP 422 responses. Authentication, verified operator membership, publication limits, audit logging, matching policy approval, donor consent, and emergency delivery controls remain enforced. Clinical policy approval is still required for donor matching; publication confirmation does not claim donors were notified.

The form shows field errors and server failures without closing or discarding entered data. It blocks repeated submissions while saving, confirms success, closes, and returns to the first unfiltered page so the saved request is visible. Published requests use the existing matching and urgency-based emergency fanout in the same database transaction.

## Reproduced defects

- A blank request address failed schema validation before the API could use the saved hospital address (HTTP 422).
- Dates were validated inconsistently across create/edit/publish, and the form did not explain the expiration ordering or show field-level errors.
- Missing coordinates could be published through direct creation or draft publication, producing requests without a usable matching location.
- Profile-loading failures were silently ignored; the form also retained stale values when reopened.

Regression tests use disposable PostgreSQL schemas, including a real database trigger failure to verify rollback and retry. Browser QA checks saved-location publishing, missing/invalid fields, duplicate clicks, database failure feedback, persistence after reload, denied GPS permission, manual map selection/facility save, and mobile layout. No real hospital request is created by these tests.

Run `python -m pytest tests/test_request_publishing.py` from `backend`, and the existing TypeScript, lint and build checks from `frontend`. No database migration or new provider credentials are required. GPS requires localhost or HTTPS; address search uses the existing configured geocoder, and manual map selection/address entry remains available during lookup outages.
