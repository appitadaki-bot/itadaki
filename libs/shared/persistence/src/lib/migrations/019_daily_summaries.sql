-- El resumen de cada día de ventas.
--
-- Las métricas se calculan recorriendo los pedidos, así que borrarlos borra
-- los números. Y no borrarlos deja la base creciendo para siempre con
-- comandas de hace un año que nadie va a volver a abrir: un restaurante con
-- 40 mesas hace unos 200 pedidos por día, o sea 70.000 al año, cada uno con
-- sus renglones.
--
-- Guardar el resumen antes de borrar deja una fila por día en vez de cientos
-- de pedidos. Lo que se pierde es el detalle —qué pidió la mesa 4 el 12 de
-- marzo— que es justamente lo que ya no le sirve a nadie y sí conviene no
-- conservar.
CREATE TABLE IF NOT EXISTS daily_summaries (
  tenant_id           text        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  day                 date        NOT NULL,
  orders              integer     NOT NULL DEFAULT 0,
  cancelled           integer     NOT NULL DEFAULT 0,
  revenue_minor       bigint      NOT NULL DEFAULT 0,
  currency            text        NOT NULL DEFAULT 'ARS',
  median_prep_minutes integer,
  -- 24 posiciones, una por hora. Cabe en una fila y se lee de una.
  orders_by_hour      jsonb       NOT NULL DEFAULT '[]',
  top_products        jsonb       NOT NULL DEFAULT '[]',
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, day)
);

-- "Las ventas del último mes" es la consulta que corre el panel cada vez.
CREATE INDEX IF NOT EXISTS daily_summaries_by_day
  ON daily_summaries (tenant_id, day DESC);

ALTER TABLE daily_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_summaries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON daily_summaries;
CREATE POLICY tenant_isolation ON daily_summaries
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'itadaki_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON daily_summaries TO itadaki_app;
  END IF;
END $$;
