-- Volver a activar el aislamiento entre restaurantes, tabla por tabla.
--
-- El panel de un restaurante recién creado mostraba los mozos de otro. La
-- consulta que los trae es `SELECT * FROM staff_users ORDER BY display_name`,
-- sin `WHERE tenant_id`: el filtro lo hace la política de row level security, y
-- en la base de producción esa política no estaba activa. Sin ella, esa
-- consulta devuelve la tabla entera.
--
-- La 002 activa el RLS de `staff_users`, así que en algún momento se perdió: el
-- registro de migraciones sólo guarda que un archivo se aplicó, y un archivo ya
-- aplicado no se vuelve a correr aunque después le agreguen líneas. Una base
-- creada antes de esas líneas se quedó sin ellas para siempre.
--
-- Esta migración no las repite a mano: recorre las tablas que tienen
-- `tenant_id` y le vuelve a poner a cada una el candado y la política. Así
-- cubre también las que se agreguen después de escribir esto, y correrla de
-- nuevo no rompe nada.
--
-- `tenants` queda afuera sola, porque no tiene `tenant_id`: es la tabla que
-- dice qué restaurantes existen, y se lee antes de saber de cuál se trata.
DO $$
DECLARE
  tabla text;
BEGIN
  FOR tabla IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND EXISTS (
             SELECT 1
               FROM information_schema.columns col
              WHERE col.table_schema = 'public'
                AND col.table_name = c.relname
                AND col.column_name = 'tenant_id'
           )
     ORDER BY c.relname
  LOOP
    -- FORCE además de ENABLE: sin él, el dueño de la tabla ve todas las filas,
    -- y la API se conecta con un rol que en Neon y en Render es el dueño.
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tabla);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tabla);

    -- Se rehace en vez de crearse sólo si falta: una política vieja con otra
    -- condición es tan mala como no tener ninguna.
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tabla);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I'
      ' USING (tenant_id = current_setting(''app.tenant_id'', true))'
      ' WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      tabla
    );

    RAISE NOTICE 'aislada: %', tabla;
  END LOOP;
END $$;
