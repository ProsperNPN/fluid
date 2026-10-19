"""Appointment availability, occupancy, consent, events and reminders."""
from alembic import op
import sqlalchemy as sa
revision = "20261018_0015"
down_revision = "20261018_0014"
branch_labels = depends_on = None


def upgrade():
    op.add_column("appointments", sa.Column("is_scheduled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("appointments", sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("appointments", sa.Column("timezone", sa.String(80), nullable=False, server_default="Africa/Accra"))
    op.add_column("appointments", sa.Column("preparation_instructions", sa.String(2000), nullable=False, server_default=""))
    op.add_column("appointments", sa.Column("proposed_by", sa.String(10), nullable=True))
    op.add_column("appointments", sa.Column("donor_confirmed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("appointments", sa.Column("hospital_confirmed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("appointments", sa.Column("checked_in_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("appointments", sa.Column("cancellation_reason", sa.String(500), nullable=True))
    op.add_column("appointments", sa.Column("outcome_confirmed_by", sa.String(36), nullable=True))
    op.add_column("appointments", sa.Column("version", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("appointments", sa.Column("schedule_version", sa.Integer(), nullable=False, server_default="0"))
    op.create_foreign_key("fk_appointment_outcome_actor", "appointments", "users", ["outcome_confirmed_by"], ["id"], ondelete="SET NULL")
    op.add_column("donor_profiles", sa.Column("appointment_timezone", sa.String(80), nullable=False, server_default="Africa/Accra"))
    op.add_column("donor_profiles", sa.Column("appointment_preferences", sa.JSON(), nullable=False, server_default="[]"))
    op.execute("""
        CREATE TABLE appointment_policies (
        	hospital_profile_id VARCHAR(36) NOT NULL, 
        	enabled BOOLEAN NOT NULL, 
        	timezone VARCHAR(80) NOT NULL, 
        	slot_minutes INTEGER NOT NULL, 
        	capacity INTEGER NOT NULL, 
        	hours JSON NOT NULL, 
        	reminder_hours JSON NOT NULL, 
        	preparation_instructions VARCHAR(2000) NOT NULL, 
        	CONSTRAINT pk_appointment_policies PRIMARY KEY (hospital_profile_id), 
        	CONSTRAINT fk_appointment_policies_hospital_profile_id_hospital_profiles FOREIGN KEY(hospital_profile_id) REFERENCES hospital_profiles (id) ON DELETE CASCADE
        )
    """)
    op.execute("""
        CREATE TABLE appointment_occupancy (
        	id VARCHAR(36) NOT NULL, 
        	appointment_id VARCHAR(36) NOT NULL, 
        	donor_user_id VARCHAR(36) NOT NULL, 
        	hospital_profile_id VARCHAR(36) NOT NULL, 
        	minute TIMESTAMP WITH TIME ZONE NOT NULL, 
        	seat INTEGER NOT NULL, 
        	CONSTRAINT pk_appointment_occupancy PRIMARY KEY (id), 
        	CONSTRAINT uq_appointment_donor_minute UNIQUE (donor_user_id, minute), 
        	CONSTRAINT uq_appointment_hospital_minute_seat UNIQUE (hospital_profile_id, minute, seat), 
        	CONSTRAINT fk_appointment_occupancy_appointment_id_appointments FOREIGN KEY(appointment_id) REFERENCES appointments (id) ON DELETE CASCADE, 
        	CONSTRAINT fk_appointment_occupancy_donor_user_id_users FOREIGN KEY(donor_user_id) REFERENCES users (id) ON DELETE CASCADE, 
        	CONSTRAINT fk_appointment_occupancy_hospital_profile_id_hospital_profiles FOREIGN KEY(hospital_profile_id) REFERENCES hospital_profiles (id) ON DELETE CASCADE
        )
    """)
    op.execute("""
        CREATE INDEX ix_appointment_occupancy_minute ON appointment_occupancy (minute)
    """)
    op.execute("""
        CREATE INDEX ix_appointment_occupancy_appointment_id ON appointment_occupancy (appointment_id)
    """)
    op.execute("""
        CREATE INDEX ix_appointment_occupancy_hospital_profile_id ON appointment_occupancy (hospital_profile_id)
    """)
    op.execute("""
        CREATE TABLE appointment_events (
        	id VARCHAR(36) NOT NULL, 
        	appointment_id VARCHAR(36) NOT NULL, 
        	version INTEGER NOT NULL, 
        	actor_user_id VARCHAR(36), 
        	action VARCHAR(40) NOT NULL, 
        	details JSON NOT NULL, 
        	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
        	CONSTRAINT pk_appointment_events PRIMARY KEY (id), 
        	CONSTRAINT uq_appointment_event_version UNIQUE (appointment_id, version), 
        	CONSTRAINT fk_appointment_events_appointment_id_appointments FOREIGN KEY(appointment_id) REFERENCES appointments (id) ON DELETE CASCADE, 
        	CONSTRAINT fk_appointment_events_actor_user_id_users FOREIGN KEY(actor_user_id) REFERENCES users (id) ON DELETE SET NULL
        )
    """)
    op.execute("""
        CREATE INDEX ix_appointment_events_appointment_id ON appointment_events (appointment_id)
    """)
    op.execute("""
        CREATE TABLE appointment_reminders (
        	id VARCHAR(36) NOT NULL, 
        	appointment_id VARCHAR(36) NOT NULL, 
        	schedule_version INTEGER NOT NULL, 
        	hours_before INTEGER NOT NULL, 
        	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
        	CONSTRAINT pk_appointment_reminders PRIMARY KEY (id), 
        	CONSTRAINT uq_appointment_reminder UNIQUE (appointment_id, schedule_version, hours_before), 
        	CONSTRAINT fk_appointment_reminders_appointment_id_appointments FOREIGN KEY(appointment_id) REFERENCES appointments (id) ON DELETE CASCADE
        )
    """)
    op.execute("""
        CREATE INDEX ix_appointment_reminders_appointment_id ON appointment_reminders (appointment_id)
    """)
    op.execute("UPDATE appointments SET ends_at = scheduled_at + interval '30 minutes', is_scheduled = true WHERE status IN ('confirmed','completed','missed')")
    op.execute("UPDATE appointments SET status = 'no_show' WHERE status = 'missed'")
    # Legacy confirmations retain their UTC time and reserve their existing 30-minute interval.
    # An actual overlapping donor record fails the unique constraint and rolls back safely.
    op.execute("""INSERT INTO appointment_occupancy (id, appointment_id, donor_user_id, hospital_profile_id, minute, seat)
        SELECT md5(a.id || minute::text), a.id, a.donor_user_id, r.hospital_profile_id, minute,
            row_number() OVER (PARTITION BY r.hospital_profile_id, minute ORDER BY a.id) - 1
        FROM appointments a JOIN blood_requests r ON r.id = a.blood_request_id
        CROSS JOIN LATERAL generate_series(date_trunc('minute', a.scheduled_at), date_trunc('minute', a.ends_at - interval '1 microsecond'), interval '1 minute') minute
        WHERE a.status = 'confirmed' AND a.ends_at > now() AND r.hospital_profile_id IS NOT NULL""")


def downgrade():
    op.execute("UPDATE appointments SET status = 'missed' WHERE status = 'no_show'")
    op.execute("UPDATE appointments SET status = 'confirmed' WHERE status = 'checked_in'")
    for table in ("appointment_reminders", "appointment_events", "appointment_occupancy", "appointment_policies"):
        op.drop_table(table)
    op.drop_column("donor_profiles", "appointment_preferences")
    op.drop_column("donor_profiles", "appointment_timezone")
    op.drop_constraint("fk_appointment_outcome_actor", "appointments", type_="foreignkey")
    op.drop_column("appointments", "schedule_version")
    op.drop_column("appointments", "version")
    op.drop_column("appointments", "outcome_confirmed_by")
    op.drop_column("appointments", "cancellation_reason")
    op.drop_column("appointments", "checked_in_at")
    op.drop_column("appointments", "hospital_confirmed_at")
    op.drop_column("appointments", "donor_confirmed_at")
    op.drop_column("appointments", "proposed_by")
    op.drop_column("appointments", "preparation_instructions")
    op.drop_column("appointments", "timezone")
    op.drop_column("appointments", "ends_at")
    op.drop_column("appointments", "is_scheduled")
