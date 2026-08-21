-- Multi-tenant schema. Every table carries tenant_id and is protected by
-- row level security, so isolation does not depend on every query
-- remembering a WHERE clause.

CREATE TABLE IF NOT EXISTS categories (
  tenant_id     text        NOT NULL,
  id            text        NOT NULL,
  name          text        NOT NULL,
  sort_order    integer     NOT NULL DEFAULT 0,
  window_start  integer,
  window_end    integer,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS products (
  tenant_id             text        NOT NULL,
  id                    text        NOT NULL,
  category_id           text        NOT NULL,
  name                  text        NOT NULL,
  description           text        NOT NULL DEFAULT '',
  -- Prices are integer minor units, never floats.
  price_minor           bigint      NOT NULL,
  currency              text        NOT NULL,
  allergens             text[]      NOT NULL DEFAULT '{}',
  diets                 text[]      NOT NULL DEFAULT '{}',
  prep_minutes          integer     NOT NULL DEFAULT 10,
  available             boolean     NOT NULL DEFAULT true,
  station               text        NOT NULL,
  image_set             jsonb,
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT price_non_negative CHECK (price_minor >= 0)
);

CREATE TABLE IF NOT EXISTS modifier_groups (
  tenant_id       text     NOT NULL,
  id              text     NOT NULL,
  product_id      text     NOT NULL,
  name            text     NOT NULL,
  min_selections  integer  NOT NULL DEFAULT 0,
  max_selections  integer  NOT NULL DEFAULT 1,
  modifiers       jsonb    NOT NULL DEFAULT '[]',
  PRIMARY KEY (tenant_id, id)
);

-- Auditable price history: who changed what, when, and from which value.
CREATE TABLE IF NOT EXISTS price_audit (
  id             bigserial   PRIMARY KEY,
  tenant_id      text        NOT NULL,
  product_id     text        NOT NULL,
  previous_minor bigint      NOT NULL,
  new_minor      bigint      NOT NULL,
  currency       text        NOT NULL,
  actor_id       text        NOT NULL,
  changed_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS table_sessions (
  tenant_id   text        NOT NULL,
  id          text        NOT NULL,
  table_id    text        NOT NULL,
  status      text        NOT NULL,
  currency    text        NOT NULL,
  diners      jsonb       NOT NULL DEFAULT '[]',
  cart_lines  jsonb       NOT NULL DEFAULT '[]',
  opened_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

-- Only one open session per table: a second phone scanning the same QR must
-- land in the same cart.
CREATE UNIQUE INDEX IF NOT EXISTS one_open_session_per_table
  ON table_sessions (tenant_id, table_id)
  WHERE status = 'OPEN';

CREATE TABLE IF NOT EXISTS orders (
  tenant_id         text        NOT NULL,
  id                text        NOT NULL,
  client_request_id text        NOT NULL,
  session_id        text        NOT NULL,
  status            text        NOT NULL,
  currency          text        NOT NULL,
  items             jsonb       NOT NULL DEFAULT '[]',
  history           jsonb       NOT NULL DEFAULT '[]',
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

-- The database enforces idempotency: a replayed offline queue entry cannot
-- create a second ticket even if the application check races.
CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency
  ON orders (tenant_id, client_request_id);

CREATE INDEX IF NOT EXISTS orders_active
  ON orders (tenant_id, status)
  WHERE status NOT IN ('DELIVERED', 'CANCELLED');

CREATE TABLE IF NOT EXISTS bills (
  tenant_id    text        NOT NULL,
  id           text        NOT NULL,
  session_id   text        NOT NULL,
  currency     text        NOT NULL,
  -- OPEN follows the table as it keeps ordering; SETTLED is frozen.
  status       text        NOT NULL DEFAULT 'OPEN',
  lines        jsonb       NOT NULL DEFAULT '[]',
  participants jsonb       NOT NULL DEFAULT '[]',
  rates        jsonb       NOT NULL DEFAULT '[]',
  closed_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

-- Existing installs: the table predates the column.
ALTER TABLE bills ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'OPEN';

CREATE UNIQUE INDEX IF NOT EXISTS one_bill_per_session
  ON bills (tenant_id, session_id);

CREATE TABLE IF NOT EXISTS images (
  tenant_id     text        NOT NULL,
  id            text        NOT NULL,
  original_path text        NOT NULL,
  params        jsonb       NOT NULL,
  image_set     jsonb       NOT NULL,
  alt           text        NOT NULL DEFAULT '',
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

-- El rol `itadaki_app`, al que apuntan todos los GRANT de abajo, no se crea
-- acá: crear roles es cosa del entorno, no del esquema.
--
-- En la laptop lo crea `scripts/init-db.sql`, que Docker Compose corre al
-- levantar la base por primera vez. En una base hosteada no existe ni hace
-- falta: la app se conecta con el usuario que da el proveedor, que es el dueño
-- de las tablas.
--
-- Estuvo acá y se sacó porque cada proveedor se niega distinto y ninguna
-- negativa se podía atrapar. Render no deja crear roles. Neon deja, acepta el
-- comando, y recién al reenviar el DDL a su panel de control lo rechaza por
-- contraseña débil — un error que nace fuera del bloque, donde ningún
-- EXCEPTION lo alcanza. Con eso, migrar una base de Neon abortaba en el primer
-- archivo y no se creaba ni una tabla.
--
-- Los GRANT de abajo ya preguntan si el rol existe, así que sin él el esquema
-- se aplica igual.

-- Los permisos del rol de la app, si ese rol existe.
--
-- En una base hosteada no existe: la app se conecta con el usuario del
-- proveedor, que es dueño de las tablas. Sin esta pregunta, migrar una base de
-- Neon o de Supabase se cortaba acá con «role "itadaki_app" does not exist».
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'itadaki_app') THEN
    GRANT USAGE ON SCHEMA public TO itadaki_app;
  END IF;
END $$;

-- Row level security. Every policy compares against app.tenant_id, which the
-- connection sets per request; a query that forgets the tenant returns nothing
-- rather than another restaurant's rows.
DO $$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'categories', 'products', 'modifier_groups', 'price_audit',
    'table_sessions', 'orders', 'bills', 'images'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', target);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', target);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true))
       WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      target
    );

    -- The role the API connects as. Granted here rather than by hand, so a
    -- database created from scratch works without anyone remembering this:
    -- row level security above is what keeps the access tenant-scoped.
    -- Skipped where the role does not exist, which is every hosted database.
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'itadaki_app') THEN
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO itadaki_app',
        target
      );
    END IF;
  END LOOP;
END $$;

-- price_audit uses a bigserial, and INSERT on it needs the sequence too.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'itadaki_app') THEN
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO itadaki_app;
  END IF;
END $$;
