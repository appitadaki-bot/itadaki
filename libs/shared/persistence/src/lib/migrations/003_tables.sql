-- Physical tables with a per-table QR secret. Rotating one table's secret
-- invalidates only that table's printed code.
CREATE TABLE IF NOT EXISTS restaurant_tables (
  tenant_id  text        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  id         text        NOT NULL,
  label      text        NOT NULL,
  seats      integer     NOT NULL DEFAULT 4,
  qr_secret  text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

ALTER TABLE restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_tables FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON restaurant_tables;
CREATE POLICY tenant_isolation ON restaurant_tables
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Los permisos del rol de la app, si ese rol existe.
--
-- En una base hosteada no existe: la app se conecta con el usuario del
-- proveedor, que es dueño de las tablas. Sin esta pregunta, migrar una base de
-- Neon o de Supabase se cortaba acá con «role "itadaki_app" does not exist».
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'itadaki_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON restaurant_tables TO itadaki_app;
  END IF;
END $$;

-- Verifying a scanned QR happens before any tenant is trusted, so that lookup
-- needs a path that is not row-filtered. Owned by the privileged role.
CREATE OR REPLACE VIEW table_secret_lookup AS
  SELECT tenant_id, id, label, seats, qr_secret FROM restaurant_tables;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'itadaki_app') THEN
    GRANT SELECT ON table_secret_lookup TO itadaki_app;
  END IF;
END $$;
