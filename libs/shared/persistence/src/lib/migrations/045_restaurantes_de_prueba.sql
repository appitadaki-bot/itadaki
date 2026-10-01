-- El restaurante de prueba que se crea solo desde la landing.
--
-- Una fila por demo vivo, con su vencimiento. Va en su propia tabla y no en
-- una columna de `tenants` ni adivinado desde el prefijo del id: el prefijo
-- está para que lo lea una persona —en la base, en un log, en la lista de
-- locales— y la fecha para que la lea la máquina. Adivinar desde el nombre
-- funciona hasta que alguien renombra algo.
--
-- El borrado no está acá: la 018 ata toda tabla con `tenant_id` a `tenants`
-- con `ON DELETE CASCADE`, así que borrar el restaurante se lleva su carta,
-- sus mesas, su gente, sus pedidos y esta fila.
CREATE TABLE IF NOT EXISTS demos (
  tenant_id  text        PRIMARY KEY REFERENCES tenants (id) ON DELETE CASCADE,
  creado_en  timestamptz NOT NULL DEFAULT now(),
  expira_en  timestamptz NOT NULL
);

-- El barrido pregunta por los vencidos, y el alta cuenta los vivos. Las dos
-- miran esta columna y ninguna filtra por restaurante.
CREATE INDEX IF NOT EXISTS demos_expira_en ON demos (expira_en);

-- Se lee sin estar adentro de ningún restaurante.
--
-- El resto de las tablas se consulta con `app.tenant_id` puesto, porque
-- pertenecen a un local. Ésta no: contar cuántos demos viven y cuáles
-- vencieron son preguntas sobre todos a la vez, igual que la lista de locales
-- de la 044.
ALTER TABLE demos DISABLE ROW LEVEL SECURITY;

-- El rol de la app sólo existe en la base de la laptop: en una hosteada la
-- API se conecta con el usuario del proveedor. Un GRANT suelto contra un rol
-- que no está aborta la migración entera.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'itadaki_app') THEN
    GRANT SELECT, INSERT, DELETE ON demos TO itadaki_app;
  END IF;
END $$;
