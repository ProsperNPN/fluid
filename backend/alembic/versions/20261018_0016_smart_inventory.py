"""Individual blood-unit traceability and fail-closed legacy stock reconciliation."""
from alembic import op
import sqlalchemy as sa
revision = "20261018_0016"
down_revision = "20261018_0015"
branch_labels = depends_on = None


def upgrade():
    op.add_column("blood_inventory", sa.Column("legacy_reported_counts", sa.JSON()))
    op.execute("""
        CREATE TABLE inventory_units (
        	id VARCHAR(36) NOT NULL, 
        	hospital_profile_id VARCHAR(36) NOT NULL, 
        	batch_id VARCHAR(36) NOT NULL, 
        	internal_identifier VARCHAR(40) NOT NULL, 
        	official_identifier VARCHAR(80), 
        	product_code VARCHAR(40), 
        	label_standard VARCHAR(20), 
        	blood_type VARCHAR(3) NOT NULL, 
        	component VARCHAR(40) NOT NULL, 
        	collected_at TIMESTAMP WITH TIME ZONE, 
        	expires_at TIMESTAMP WITH TIME ZONE, 
        	status VARCHAR(20) NOT NULL, 
        	testing_status VARCHAR(20) NOT NULL, 
        	storage_location VARCHAR(160) NOT NULL, 
        	temperature_c FLOAT, 
        	released_at TIMESTAMP WITH TIME ZONE, 
        	released_by VARCHAR(36), 
        	reserved_request_id VARCHAR(36), 
        	recall_active BOOLEAN NOT NULL, 
        	version INTEGER NOT NULL, 
        	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
        	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
        	CONSTRAINT pk_inventory_units PRIMARY KEY (id), 
        	CONSTRAINT uq_inventory_official_product UNIQUE (hospital_profile_id, official_identifier, product_code), 
        	CONSTRAINT ck_inventory_units_inventory_unit_status CHECK (status IN ('quarantined','testing','available','reserved','used','expired','discarded')), 
        	CONSTRAINT ck_inventory_units_inventory_release_required CHECK (status NOT IN ('available','reserved') OR (testing_status = 'passed' AND released_at IS NOT NULL AND expires_at IS NOT NULL)), 
        	CONSTRAINT fk_inventory_units_hospital_profile_id_hospital_profiles FOREIGN KEY(hospital_profile_id) REFERENCES hospital_profiles (id) ON DELETE RESTRICT, 
        	CONSTRAINT fk_inventory_units_batch_id_blood_inventory FOREIGN KEY(batch_id) REFERENCES blood_inventory (id) ON DELETE RESTRICT, 
        	CONSTRAINT uq_inventory_units_internal_identifier UNIQUE (internal_identifier), 
        	CONSTRAINT fk_inventory_units_released_by_users FOREIGN KEY(released_by) REFERENCES users (id) ON DELETE RESTRICT, 
        	CONSTRAINT fk_inventory_units_reserved_request_id_blood_requests FOREIGN KEY(reserved_request_id) REFERENCES blood_requests (id) ON DELETE SET NULL
        )
    """)
    op.execute('CREATE INDEX ix_inventory_units_hospital_profile_id ON inventory_units (hospital_profile_id)')
    op.execute('CREATE INDEX ix_inventory_units_blood_type ON inventory_units (blood_type)')
    op.execute('CREATE INDEX ix_inventory_units_expires_at ON inventory_units (expires_at)')
    op.execute('CREATE INDEX ix_inventory_units_component ON inventory_units (component)')
    op.execute('CREATE INDEX ix_inventory_units_batch_id ON inventory_units (batch_id)')
    op.execute('CREATE INDEX ix_inventory_units_reserved_request_id ON inventory_units (reserved_request_id)')
    op.execute('CREATE INDEX ix_inventory_units_status ON inventory_units (status)')
    op.execute("""
        CREATE TABLE inventory_component_policies (
        	id VARCHAR(36) NOT NULL, 
        	hospital_profile_id VARCHAR(36) NOT NULL, 
        	component VARCHAR(40) NOT NULL, 
        	approved BOOLEAN NOT NULL, 
        	standard_reference VARCHAR(500) NOT NULL, 
        	max_shelf_life_hours INTEGER, 
        	temperature_min_c FLOAT, 
        	temperature_max_c FLOAT, 
        	storage_requirements VARCHAR(1000) NOT NULL, 
        	expiry_warning_hours INTEGER NOT NULL, 
        	version INTEGER NOT NULL, 
        	CONSTRAINT pk_inventory_component_policies PRIMARY KEY (id), 
        	CONSTRAINT uq_inventory_component_policy UNIQUE (hospital_profile_id, component), 
        	CONSTRAINT fk_inventory_component_policies_hospital_profile_id_hos_ddc7 FOREIGN KEY(hospital_profile_id) REFERENCES hospital_profiles (id) ON DELETE CASCADE
        )
    """)
    op.execute('CREATE INDEX ix_inventory_component_policies_hospital_profile_id ON inventory_component_policies (hospital_profile_id)')
    op.execute("""
        CREATE TABLE inventory_stock_policies (
        	id VARCHAR(36) NOT NULL, 
        	hospital_profile_id VARCHAR(36) NOT NULL, 
        	blood_type VARCHAR(3) NOT NULL, 
        	component VARCHAR(40) NOT NULL, 
        	minimum INTEGER NOT NULL, 
        	critical INTEGER NOT NULL, 
        	CONSTRAINT pk_inventory_stock_policies PRIMARY KEY (id), 
        	CONSTRAINT uq_inventory_stock_policy UNIQUE (hospital_profile_id, blood_type, component), 
        	CONSTRAINT fk_inventory_stock_policies_hospital_profile_id_hospita_60d4 FOREIGN KEY(hospital_profile_id) REFERENCES hospital_profiles (id) ON DELETE CASCADE
        )
    """)
    op.execute('CREATE INDEX ix_inventory_stock_policies_hospital_profile_id ON inventory_stock_policies (hospital_profile_id)')
    op.execute("""
        CREATE TABLE inventory_movements (
        	id VARCHAR(36) NOT NULL, 
        	hospital_profile_id VARCHAR(36) NOT NULL, 
        	unit_id VARCHAR(36) NOT NULL, 
        	actor_user_id VARCHAR(36), 
        	action VARCHAR(40) NOT NULL, 
        	details JSON NOT NULL, 
        	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
        	CONSTRAINT pk_inventory_movements PRIMARY KEY (id), 
        	CONSTRAINT fk_inventory_movements_hospital_profile_id_hospital_profiles FOREIGN KEY(hospital_profile_id) REFERENCES hospital_profiles (id) ON DELETE RESTRICT, 
        	CONSTRAINT fk_inventory_movements_unit_id_inventory_units FOREIGN KEY(unit_id) REFERENCES inventory_units (id) ON DELETE RESTRICT, 
        	CONSTRAINT fk_inventory_movements_actor_user_id_users FOREIGN KEY(actor_user_id) REFERENCES users (id) ON DELETE RESTRICT
        )
    """)
    op.execute('CREATE INDEX ix_inventory_movements_created_at ON inventory_movements (created_at)')
    op.execute('CREATE INDEX ix_inventory_movements_hospital_profile_id ON inventory_movements (hospital_profile_id)')
    op.execute('CREATE INDEX ix_inventory_movements_unit_id ON inventory_movements (unit_id)')
    op.execute("""
        CREATE TABLE inventory_alert_states (
        	id VARCHAR(36) NOT NULL, 
        	hospital_profile_id VARCHAR(36) NOT NULL, 
        	key VARCHAR(150) NOT NULL, 
        	state VARCHAR(100) NOT NULL, 
        	CONSTRAINT pk_inventory_alert_states PRIMARY KEY (id), 
        	CONSTRAINT uq_inventory_alert_state UNIQUE (hospital_profile_id, key), 
        	CONSTRAINT fk_inventory_alert_states_hospital_profile_id_hospital_profiles FOREIGN KEY(hospital_profile_id) REFERENCES hospital_profiles (id) ON DELETE CASCADE
        )
    """)
    op.execute('CREATE INDEX ix_inventory_alert_states_hospital_profile_id ON inventory_alert_states (hospital_profile_id)')
    op.execute("CREATE OR REPLACE FUNCTION fluid_inventory_immutable() RETURNS trigger LANGUAGE plpgsql AS $$\nBEGIN RAISE EXCEPTION 'Inventory movement history is append-only'; END; $$")
    op.execute('CREATE TRIGGER inventory_movement_immutable BEFORE UPDATE OR DELETE ON inventory_movements\nFOR EACH ROW EXECUTE FUNCTION fluid_inventory_immutable()')
    op.execute("UPDATE blood_inventory SET legacy_reported_counts = json_build_object('available', units_available, 'reserved', units_reserved)")
    # Existing counts have no clinical release evidence. Preserve each physical unit in quarantine.
    op.execute("""INSERT INTO inventory_units (id,hospital_profile_id,batch_id,internal_identifier,blood_type,component,collected_at,expires_at,status,testing_status,storage_location,recall_active,version)
        SELECT (substr(h,1,8)||'-'||substr(h,9,4)||'-'||substr(h,13,4)||'-'||substr(h,17,4)||'-'||substr(h,21,12)),hospital_profile_id,id,'FLU-'||upper(h),blood_type,component,
            collection_date::timestamp AT TIME ZONE 'UTC', (expiration_date + 1)::timestamp AT TIME ZONE 'UTC', 'quarantined','not_tested',storage_location,false,0
        FROM (SELECT b.*,md5(b.id||':'||n::text) h FROM blood_inventory b CROSS JOIN LATERAL generate_series(1,b.units_available) n) legacy""")
    op.execute("""INSERT INTO inventory_movements (id,hospital_profile_id,unit_id,action,details)
        SELECT md5(id||'legacy-intake'),hospital_profile_id,id,'legacy_intake',json_build_object('reason','Legacy quantity retained; clinical release and official identifiers require reconciliation','available_delta',0)
        FROM inventory_units""")
    op.execute("""INSERT INTO inventory_stock_policies (id,hospital_profile_id,blood_type,component,minimum,critical)
        SELECT md5(hospital_profile_id||blood_type||component),hospital_profile_id,blood_type,component,max(minimum_threshold),0
        FROM blood_inventory GROUP BY hospital_profile_id,blood_type,component""")
    op.execute("UPDATE blood_inventory SET units_available=0,units_reserved=0")


def downgrade():
    # A rollback after physical tracking begins must not silently destroy traceability.
    bind=op.get_bind()
    if bind.execute(sa.text("SELECT count(*) FROM inventory_movements WHERE action <> 'legacy_intake'")).scalar_one():
        raise RuntimeError('Inventory movements exist; export/reconcile traceability before downgrading')
    op.execute("UPDATE blood_inventory SET units_available=(legacy_reported_counts->>'available')::int,units_reserved=(legacy_reported_counts->>'reserved')::int WHERE legacy_reported_counts IS NOT NULL")
    for table in ('inventory_alert_states','inventory_movements','inventory_stock_policies','inventory_component_policies','inventory_units'):
        op.drop_table(table)
    op.execute('DROP FUNCTION IF EXISTS fluid_inventory_immutable()')
    op.drop_column('blood_inventory','legacy_reported_counts')
