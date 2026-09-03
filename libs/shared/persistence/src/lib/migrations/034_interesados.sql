-- Los que dejan sus datos antes de tener cuenta.
--
-- El alta creaba la cuenta en el momento, y el dueño entraba a un panel vacío
-- justo cuando la landing le había prometido la carta ya cargada. Ahora deja
-- sus datos, alguien le arma la carta, y recién entonces recibe el acceso.
--
-- No tiene `tenant_id` a propósito: todavía no hay restaurante. Vive fuera del
-- aislamiento por local, como `schema_migrations`, y por eso tampoco lleva RLS
-- —no hay tenant contra el cual comparar—. La lee el equipo, no la app.
CREATE TABLE IF NOT EXISTS interesados (
  id          text        PRIMARY KEY,
  local       text        NOT NULL,
  nombre      text        NOT NULL,
  whatsapp    text        NOT NULL,
  email       text,
  mesas       integer,
  -- Cómo tiene la carta hoy: 'link', 'foto' o 'papel'. Decide cuánto trabajo
  -- es cada alta antes de levantar el teléfono.
  carta_como  text        NOT NULL,
  -- El link, cuando lo hay. Con eso la carta se importa en minutos.
  carta_link  text,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  -- Cuándo se lo atendió, para no perder a nadie entre veinte pedidos.
  atendido_en timestamptz
);

CREATE INDEX IF NOT EXISTS interesados_sin_atender
  ON interesados (creado_en DESC)
  WHERE atendido_en IS NULL;
