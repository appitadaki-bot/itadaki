-- Que borrar un restaurante se lleve todo lo suyo.
--
-- La 002 ató a `tenants` las ocho tablas que existían entonces, pero lo hizo
-- con una lista escrita a mano. `session_invites` nació después y quedó
-- afuera: sus filas sobreviven al borrado del restaurante que las emitió.
--
-- Con una sola tabla suelta el agujero es chico. Lo que lo hace crecer es el
-- mecanismo: la próxima tabla con `tenant_id` también va a quedar afuera, y
-- nadie lo va a notar hasta que alguien borre un tenant y encuentre restos.
--
-- Así que en vez de nombrar la que falta, esto recorre las que hay. Cualquier
-- tabla con `tenant_id` queda atada, y una tabla nueva se ata sola la próxima
-- vez que corran las migraciones.
DO $$
DECLARE
  target text;
BEGIN
  FOR target IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'tenant_id'
      -- Las vistas no llevan claves, y `tenants` no se referencia a sí misma.
      AND t.table_type = 'BASE TABLE'
      AND c.table_name <> 'tenants'
  LOOP
    -- Las huérfanas bloquearían la clave. Son filas de un restaurante que ya
    -- no existe: nadie puede leerlas, porque el aislamiento por tenant las
    -- filtra en cada consulta.
    EXECUTE format(
      'DELETE FROM %I WHERE tenant_id NOT IN (SELECT id FROM tenants)', target
    );

    -- Se rehace en vez de saltearse si ya está: las migraciones vuelven a
    -- correr enteras en cada despliegue, y una clave que ya existe con la
    -- misma forma es un no-op barato.
    EXECUTE format(
      'ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', target, target || '_tenant_fk'
    );
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (tenant_id)
         REFERENCES tenants (id) ON DELETE CASCADE',
      target, target || '_tenant_fk'
    );
  END LOOP;
END $$;
