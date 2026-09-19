-- Quién cerró cada mesa, y cómo.
--
-- La cuenta guardaba cuánto, con qué medio y cuándo — no quién. Si al otro día
-- faltaban cuarenta mil pesos, las métricas decían que habían entrado y no
-- había forma de reconstruir qué persona cerró esa mesa.
--
-- Dos formas de cerrarla, las dos acá: cobrarla, y liberarla sin cobrar. La
-- segunda es la que no dejaba rastro de ningún tipo, porque no escribe una
-- cuenta: la mesa simplemente desaparecía del tablero.
--
-- Tabla aparte y no dos columnas en `bills` porque liberar sin cobrar no crea
-- ninguna cuenta, y porque un registro de auditoría no se pisa: la fila queda
-- aunque la mesa se vuelva a abrir.
CREATE TABLE IF NOT EXISTS cierres_de_mesa (
  tenant_id   text        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  id          text        NOT NULL,
  session_id  text        NOT NULL,
  table_id    text        NOT NULL,
  -- 'COBRO' o 'LIBERO'. Sin CHECK: mañana puede haber otra forma de cerrar y
  -- este registro tiene que poder anotarla, no rechazarla.
  que_hizo    text        NOT NULL,
  -- Quién, por id y por nombre. El nombre se copia a propósito: el registro
  -- tiene que seguir diciendo quién fue aunque esa persona ya no trabaje acá.
  quien_id    text        NOT NULL,
  quien       text        NOT NULL,
  rol         text        NOT NULL,
  -- Lo cobrado y con qué, cuando se cobró. Nulos al liberar.
  monto_minor integer,
  medio       text,
  cuando      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

-- Lo que se pregunta: qué se cerró en este local, lo último primero.
CREATE INDEX IF NOT EXISTS cierres_por_fecha
  ON cierres_de_mesa (tenant_id, cuando DESC);

ALTER TABLE cierres_de_mesa ENABLE ROW LEVEL SECURITY;
ALTER TABLE cierres_de_mesa FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON cierres_de_mesa;
CREATE POLICY tenant_isolation ON cierres_de_mesa
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'itadaki_app') THEN
    GRANT SELECT, INSERT ON cierres_de_mesa TO itadaki_app;
  END IF;
END $$;
