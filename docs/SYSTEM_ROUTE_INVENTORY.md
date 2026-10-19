# FLUID source inventory

Generated from the working tree on 2026-10-18. This identifies source coverage; it does not certify every route.

## Frontend pages

- `/about` - `frontend/app/about/page.tsx`
- `/admin/audit-logs` - `frontend/app/admin/audit-logs/page.tsx`
- `/admin/donors` - `frontend/app/admin/donors/page.tsx`
- `/admin/hospital-verifications/[id]` - `frontend/app/admin/hospital-verifications/[id]/page.tsx`
- `/admin/hospital-verifications` - `frontend/app/admin/hospital-verifications/page.tsx`
- `/admin/hospitals` - `frontend/app/admin/hospitals/page.tsx`
- `/admin` - `frontend/app/admin/page.tsx`
- `/admin/settings` - `frontend/app/admin/settings/page.tsx`
- `/admin/users` - `frontend/app/admin/users/page.tsx`
- `/auth/forgot-password` - `frontend/app/auth/forgot-password/page.tsx`
- `/auth/login` - `frontend/app/auth/login/page.tsx`
- `/auth` - `frontend/app/auth/page.tsx`
- `/auth/register` - `frontend/app/auth/register/page.tsx`
- `/auth/reset-password` - `frontend/app/auth/reset-password/page.tsx`
- `/contact` - `frontend/app/contact/page.tsx`
- `/donor/appointments` - `frontend/app/donor/appointments/page.tsx`
- `/donor/availability` - `frontend/app/donor/availability/page.tsx`
- `/donor/history` - `frontend/app/donor/history/page.tsx`
- `/donor/location` - `frontend/app/donor/location/page.tsx`
- `/donor/messages` - `frontend/app/donor/messages/page.tsx`
- `/donor/notifications` - `frontend/app/donor/notifications/page.tsx`
- `/donor` - `frontend/app/donor/page.tsx`
- `/donor/profile` - `frontend/app/donor/profile/page.tsx`
- `/donor/requests` - `frontend/app/donor/requests/page.tsx`
- `/donor/resources` - `frontend/app/donor/resources/page.tsx`
- `/hospital/analytics` - `frontend/app/hospital/analytics/page.tsx`
- `/hospital/appointments` - `frontend/app/hospital/appointments/page.tsx`
- `/hospital/donors` - `frontend/app/hospital/donors/page.tsx`
- `/hospital/emergencies` - `frontend/app/hospital/emergencies/page.tsx`
- `/hospital/inventory` - `frontend/app/hospital/inventory/page.tsx`
- `/hospital/location` - `frontend/app/hospital/location/page.tsx`
- `/hospital/messages` - `frontend/app/hospital/messages/page.tsx`
- `/hospital/notifications` - `frontend/app/hospital/notifications/page.tsx`
- `/hospital` - `frontend/app/hospital/page.tsx`
- `/hospital/profile` - `frontend/app/hospital/profile/page.tsx`
- `/hospital/requests` - `frontend/app/hospital/requests/page.tsx`
- `/hospital/staff` - `frontend/app/hospital/staff/page.tsx`
- `/` - `frontend/app/page.tsx`

## FastAPI endpoint declarations

Paths use the configured API prefix (default `/api/v1`). Router mount configuration is in `backend/app/api/v1/router.py`.

| Method | Router path | Handler |
| --- | --- | --- |
| GET | `/admin/hospitals` | `admin.list_hospitals` |
| GET | `/admin/users` | `admin.list_users` |
| GET | `/admin/audit-logs` | `admin.list_audit_logs` |
| GET | `/analytics/overview` | `analytics.get_analytics_overview` |
| GET | `/appointments/policy` | `appointments.get_policy` |
| PUT | `/appointments/policy` | `appointments.save_policy` |
| GET | `/appointments/preferences` | `appointments.get_preferences` |
| PUT | `/appointments/preferences` | `appointments.save_preferences` |
| GET | `/appointments/available-slots` | `appointments.available_slots` |
| GET | `/appointments` | `appointments.list_appointments` |
| POST | `/appointments` | `appointments.create_appointment` |
| GET | `/appointments/{appointment_id}/slots` | `appointments.appointment_slots` |
| PATCH | `/appointments/{appointment_id}/schedule` | `appointments.schedule_appointment` |
| PATCH | `/appointments/{appointment_id}/status` | `appointments.update_appointment_status` |
| PATCH | `/appointments/{appointment_id}/cancel` | `appointments.cancel_appointment` |
| GET | `/appointments/{appointment_id}/history` | `appointments.appointment_history` |
| GET | `/appointments/{appointment_id}/calendar` | `appointments.calendar_download` |
| GET | `/appointments/{appointment_id}/confirmation` | `appointments.download_confirmation` |
| POST | `/auth/register` | `auth.register_user` |
| POST | `/auth/login` | `auth.login` |
| POST | `/auth/forgot-password` | `auth.forgot_password` |
| POST | `/auth/reset-password` | `auth.reset_password` |
| POST | `/auth/refresh` | `auth.refresh_tokens` |
| POST | `/auth/logout` | `auth.logout` |
| GET | `/blood-requests` | `blood_requests.list_blood_requests` |
| GET | `/blood-requests/page` | `blood_requests.list_blood_requests_page` |
| GET | `/blood-requests/{request_id}` | `blood_requests.get_blood_request` |
| POST | `/blood-requests` | `blood_requests.create_blood_request` |
| PUT | `/blood-requests/{request_id}` | `blood_requests.update_draft` |
| POST | `/blood-requests/{request_id}/publish` | `blood_requests.publish_request` |
| POST | `/blood-requests/{request_id}/transition` | `blood_requests.transition_request` |
| POST | `/blood-requests/{request_id}/cancel` | `blood_requests.cancel_request` |
| GET | `/dashboard/summary` | `dashboard.get_dashboard_summary` |
| GET | `/donor-matches/invitations` | `donor_matches.donor_invitations` |
| GET | `/donor-matches/compatible` | `donor_matches.list_compatible_requests` |
| POST | `/donor-matches/{request_id}/responses/{response_status}` | `donor_matches.respond_to_request` |
| GET | `/donor-matches` | `donor_matches.list_donor_matches` |
| POST | `/donor-matches/responses/{response_id}/{decision}` | `donor_matches.decide_donor_response` |
| GET | `/donor-matches/potential` | `donor_matches.potential_donors` |
| POST | `/donor-matches/{request_id}/invite/{donor_id}` | `donor_matches.invite_donor` |
| POST | `/donor-matches/responses/{response_id}/blood-type/verify` | `donor_matches.verify_blood_type` |
| GET | `/emergencies` | `emergencies.overview` |
| POST | `/emergencies/{request_id}/escalate` | `emergencies.escalate` |
| GET | `/health` | `health.health_check` |
| GET | `/inventory` | `inventory.list_inventory` |
| POST | `/inventory` | `inventory.create_inventory` |
| POST | `/inventory/{item_id}/adjust` | `inventory.adjust_inventory` |
| GET | `/inventory/{item_id}/transactions` | `inventory.inventory_transactions` |
| PATCH | `/inventory/{item_id}/settings` | `inventory.inventory_settings` |
| GET | `/inventory/summary` | `inventory_units.summary` |
| GET | `/inventory/component-policies` | `inventory_units.component_policies` |
| PUT | `/inventory/component-policies/{component}` | `inventory_units.set_component_policy` |
| PUT | `/inventory/stock-policy` | `inventory_units.set_stock_policy` |
| POST | `/inventory/scan` | `inventory_units.scan` |
| GET | `/inventory/units` | `inventory_units.units` |
| POST | `/inventory/units` | `inventory_units.create` |
| GET | `/inventory/units/{unit_id}` | `inventory_units.detail` |
| PUT | `/inventory/units/{unit_id}` | `inventory_units.edit` |
| POST | `/inventory/units/{unit_id}/actions` | `inventory_units.action` |
| GET | `/inventory/units/{unit_id}/qr` | `inventory_units.qr` |
| GET | `/inventory/units/{unit_id}/history` | `inventory_units.history` |
| POST | `/inventory/units/intake` | `inventory_units.bulk_intake` |
| POST | `/locations/search` | `locations.search` |
| POST | `/locations/reverse` | `locations.reverse` |
| GET | `/locations/me` | `locations.get_location` |
| PATCH | `/locations/me` | `locations.save_location` |
| PATCH | `/locations/radius` | `locations.radius` |
| GET | `/locations/nearby` | `locations.nearby` |
| GET | `/messages` | `messages.list_conversations` |
| POST | `/messages/conversations` | `messages.start_conversation` |
| GET | `/messages/conversations/{conversation_id}` | `messages.read_conversation` |
| POST | `/messages/conversations/{conversation_id}` | `messages.send_message` |
| GET | `/notifications/state` | `notifications.state` |
| GET | `/notifications/stream` | `notifications.stream` |
| PATCH | `/notifications/{notification_id}/unread` | `notifications.mark_unread` |
| GET | `/notifications` | `notifications.list_notifications` |
| PATCH | `/notifications/{notification_id}/read` | `notifications.mark_read` |
| PATCH | `/notifications/read-all` | `notifications.mark_all_read` |
| DELETE | `/notifications/{notification_id}` | `notifications.delete_notification` |
| GET | `/portal/donor-data` | `portal.donor_data` |
| GET | `/portal/hospital-data` | `portal.hospital_data` |
| GET | `/portal/admin-data` | `portal.admin_data` |
| GET | `/profiles/donor/me` | `profiles.get_my_donor_profile` |
| PUT | `/profiles/donor/me` | `profiles.update_my_donor_profile` |
| PATCH | `/profiles/donor/me/availability` | `profiles.update_my_donor_availability` |
| PATCH | `/profiles/donor/me/location` | `profiles.update_my_donor_location` |
| GET | `/profiles/hospital/me` | `profiles.get_my_hospital_profile` |
| PUT | `/profiles/hospital/me` | `profiles.update_my_hospital_profile` |
| GET | `/protected/profile` | `protected.read_profile` |
| GET | `/protected/admin/audit` | `protected.admin_audit` |
| GET | `/hospital-staff` | `staff.list_staff` |
| POST | `/hospital-staff/invite` | `staff.invite_staff` |
| PATCH | `/hospital-staff/{member_id}/role` | `staff.update_staff_role` |
| PATCH | `/hospital-staff/{member_id}/deactivate` | `staff.deactivate_staff` |
| GET | `/users/me` | `users.read_me` |
| GET | `/hospital-verifications/mine` | `verifications.my_verification` |
| POST | `/hospital-verifications/submit` | `verifications.submit_verification` |
| GET | `/hospital-verifications` | `verifications.list_verifications` |
| GET | `/hospital-verifications/{verification_id}` | `verifications.verification_detail` |
| GET | `/hospital-verifications/documents/{document_id}` | `verifications.get_document` |
| POST | `/hospital-verifications/{verification_id}/decision` | `verifications.decide_verification` |
| GET | `/workspace/overview` | `workspace.overview` |
| GET | `/workspace/analytics` | `workspace.analytics` |

## Models

- `backend/app/models/appointment.py`
- `backend/app/models/appointment_schedule.py`
- `backend/app/models/audit_log.py`
- `backend/app/models/base.py`
- `backend/app/models/blood_inventory.py`
- `backend/app/models/blood_request.py`
- `backend/app/models/conversation.py`
- `backend/app/models/donor_profile.py`
- `backend/app/models/donor_response.py`
- `backend/app/models/emergency_alert.py`
- `backend/app/models/hospital_membership.py`
- `backend/app/models/hospital_profile.py`
- `backend/app/models/hospital_verification.py`
- `backend/app/models/inventory_unit.py`
- `backend/app/models/notification.py`
- `backend/app/models/password_reset_token.py`
- `backend/app/models/refresh_token.py`
- `backend/app/models/user.py`

## Services

- `backend/app/services/alert_worker.py`
- `backend/app/services/appointment_scheduling.py`
- `backend/app/services/auth_token_service.py`
- `backend/app/services/blood_matching.py`
- `backend/app/services/email_service.py`
- `backend/app/services/emergency_alerts.py`
- `backend/app/services/geocoding.py`
- `backend/app/services/intelligent_matching.py`
- `backend/app/services/notification_delivery.py`
- `backend/app/services/notification_stream.py`
- `backend/app/services/request_lifecycle.py`
- `backend/app/services/smart_inventory.py`
- `backend/app/services/verification_storage.py`

## Migrations

- `backend/alembic/versions/20260707_0001_create_users_and_refresh_tokens.py`
- `backend/alembic/versions/20260707_0002_create_blood_requests.py`
- `backend/alembic/versions/20260708_0003_add_user_role.py`
- `backend/alembic/versions/20260708_0004_create_profiles.py`
- `backend/alembic/versions/20260709_0005_create_password_reset_tokens.py`
- `backend/alembic/versions/20260710_0006_expand_donor_profiles.py`
- `backend/alembic/versions/20260710_0007_create_donor_workflows.py`
- `backend/alembic/versions/20260711_0008_create_hospital_operations.py`
- `backend/alembic/versions/20260717_0009_create_hospital_verifications.py`
- `backend/alembic/versions/20261014_0010_portal_workflows.py`
- `backend/alembic/versions/20261016_0011_location_metadata.py`
- `backend/alembic/versions/20261017_0012_matching_consent.py`
- `backend/alembic/versions/20261018_0013_emergency_alerts.py`
- `backend/alembic/versions/20261018_0014_response_timestamp.py`
- `backend/alembic/versions/20261018_0015_appointment_scheduling.py`
- `backend/alembic/versions/20261018_0016_smart_inventory.py`

## Frontend API services

- `frontend/services/admin-service.ts`
- `frontend/services/analytics-service.ts`
- `frontend/services/appointments-service.ts`
- `frontend/services/auth-service.ts`
- `frontend/services/blood-requests-service.ts`
- `frontend/services/compatible-requests-service.ts`
- `frontend/services/dashboard-service.ts`
- `frontend/services/donor-matches-service.ts`
- `frontend/services/hospital-donors-service.ts`
- `frontend/services/hospital-requests-service.ts`
- `frontend/services/hospital-staff-service.ts`
- `frontend/services/inventory-service.ts`
- `frontend/services/location-service.ts`
- `frontend/services/messages-service.ts`
- `frontend/services/notifications-service.ts`
- `frontend/services/portal-service.ts`
- `frontend/services/profile-service.ts`
- `frontend/services/smart-inventory-service.ts`
- `frontend/services/verification-service.ts`
- `frontend/services/workspace-service.ts`

## Backend configuration keys (values intentionally excluded)

- `ENVIRONMENT`
- `DEBUG`
- `APP_NAME`
- `APP_VERSION`
- `API_V1_STR`
- `JWT_SECRET_KEY`
- `JWT_ALGORITHM`
- `ACCESS_TOKEN_EXPIRE_MINUTES`
- `REFRESH_TOKEN_EXPIRE_DAYS`
- `SECURITY_HEADERS_ENABLED`
- `MAX_AUTH_HEADER_LENGTH`
- `DATABASE_URL`
- `FRONTEND_URL`
- `VERIFICATION_UPLOAD_DIR`
- `VERIFICATION_MAX_FILE_BYTES`
- `ADMIN_VERIFICATION_EMAIL`
- `ALERT_EMAIL_ENABLED`
- `ALERT_SMS_ENABLED`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `ALERT_ESCALATION_WAIT_SECONDS`
- `ALERT_RETRY_LIMIT`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USERNAME`
- `SMTP_PASSWORD`
- `SMTP_FROM_EMAIL`
- `INVENTORY_EXPIRY_WARNING_DAYS`
- `GEOCODING_ENABLED`
- `GEOCODING_BASE_URL`
- `GEOCODING_USER_AGENT`
- `GEOCODING_MIN_INTERVAL_SECONDS`
- `DONATION_POLICY_APPROVED`
- `DONATION_INTERVAL_DAYS`
- `DONOR_MIN_AGE`
- `DONOR_MAX_AGE`
- `CORS_ORIGINS`
