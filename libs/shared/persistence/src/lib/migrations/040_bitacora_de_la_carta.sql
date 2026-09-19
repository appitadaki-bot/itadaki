-- Quién tocó la carta, qué cambió y cuándo.
--
-- Había una tabla `price_audit` con su implementación y su puerto, pero nadie
-- la llamaba: estaba vacía. Y los endpoints de la carta ni siquiera pedían la
-- sesión, así que el dato de quién hacía el cambio no llegaba a ninguna parte.
--
-- Importa ahora más que antes. Soporte puede escribir en la carta de
-- cualquier restaurante, y el argumento para dárselo fue que quedara
-- registrado quién hizo qué. Sin esto, ante un "alguien me cambió un precio"
-- no hay forma de saber si fue el dueño, su encargado o nosotros.
--
-- Una sola tabla para todo y no una por tipo de cambio: lo que se consulta es
-- "qué pasó en esta carta", y eso con tres tablas obliga a unirlas cada vez.
CREATE TABLE IF NOT EXISTS carta_bitacora (
  id            bigserial PRIMARY KEY,
  tenant_id     text NOT NULL,
  -- Qué se tocó: un plato, una categoría, o la carta entera al importarla.
  entidad       text NOT NULL,
  entidad_id    text,
  -- Qué se le hizo.
  accion        text NOT NULL,
  -- El antes y el después, como los muestra el panel. Texto y no números
  -- porque un cambio de nombre y uno de precio se leen igual en la lista.
  antes         text,
  despues       text,
  -- Quién. Se guarda también el rol: saber que fue "soporte" y no el dueño
  -- es justamente lo que se quiere poder responder.
  actor_id      text NOT NULL,
  actor_nombre  text NOT NULL,
  actor_rol     text NOT NULL,
  cuando        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT carta_bitacora_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE
);

-- Se consulta siempre por local y por fecha: "qué pasó acá últimamente".
CREATE INDEX IF NOT EXISTS carta_bitacora_por_local
  ON carta_bitacora (tenant_id, cuando DESC);

ALTER TABLE carta_bitacora ENABLE ROW LEVEL SECURITY;
ALTER TABLE carta_bitacora FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON carta_bitacora;
CREATE POLICY tenant_isolation ON carta_bitacora
  USING (tenant_id = current_setting('app.tenant_id', true));

-- El rol de la aplicación necesita escribir y leer, y la secuencia del
-- bigserial aparte: sin ella el INSERT falla aunque la tabla esté permitida.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'itadaki_app') THEN
    GRANT SELECT, INSERT ON carta_bitacora TO itadaki_app;
    GRANT USAGE, SELECT ON SEQUENCE carta_bitacora_id_seq TO itadaki_app;
  END IF;
END $$;

COMMENT ON TABLE carta_bitacora IS
  'Quién cambió qué en la carta. Se consulta desde el panel, no sólo desde la base.';
