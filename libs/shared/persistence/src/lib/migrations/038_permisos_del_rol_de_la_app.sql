-- Los permisos del rol con el que se conecta la API, aplicados de una vez.
--
-- Cada migración otorga lo suyo a `itadaki_app`, pero condicionado a que el rol
-- exista: en una base donde todavía no está, esos GRANT se saltean y no se
-- vuelven a ejecutar nunca, porque el registro de migraciones ya las da por
-- aplicadas. Al mudarnos a Supabase la base arrancó sin ese rol, así que el
-- esquema quedó completo y sin un solo permiso otorgado.
--
-- Esta migración los repone todos juntos. Recorre lo que hay en vez de nombrar
-- tabla por tabla, así cubre también lo que se agregue después, y correrla de
-- nuevo no rompe nada.
--
-- Por qué un rol aparte y no el dueño de la base: el aislamiento entre
-- restaurantes es una política de row level security, y el dueño —o cualquier
-- rol con BYPASSRLS— la saltea. Las consultas no llevan `WHERE tenant_id`
-- porque confían en esa política, así que con el rol equivocado el panel de un
-- local muestra los datos de otro y nada falla. Crear el rol es manual, porque
-- lleva contraseña:
--
--   CREATE ROLE itadaki_app LOGIN PASSWORD 'la-que-sea' NOBYPASSRLS NOSUPERUSER;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'itadaki_app') THEN
    RAISE NOTICE 'itadaki_app no existe todavía: no hay a quién darle permisos';
    RETURN;
  END IF;

  EXECUTE 'GRANT USAGE ON SCHEMA public TO itadaki_app';

  -- Tablas y vistas: leer y escribir. Lo que puede ver de cada una lo decide
  -- la política, no el permiso.
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO itadaki_app';
  EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO itadaki_app';

  /*
   * Las tres funciones que miran más allá de un restaurante.
   *
   * Entrar al sistema y validar el QR de una mesa ocurren antes de saber de
   * qué local se trata, así que no pueden pasar por la política. Corren como
   * su dueño y devuelven una fila y nada más — por eso se otorga ejecutarlas
   * y no leer las tablas de atrás.
   */
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'staff_login_lookup_fn') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION staff_login_lookup_fn(text) TO itadaki_app';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'staff_username_lookup_fn') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION staff_username_lookup_fn(text) TO itadaki_app';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'table_secret_lookup_fn') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION table_secret_lookup_fn(text, text) TO itadaki_app';
  END IF;

  -- Lo que se cree de acá en adelante, sin tener que acordarse de otorgarlo.
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public '
       || 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO itadaki_app';
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public '
       || 'GRANT USAGE, SELECT ON SEQUENCES TO itadaki_app';

  RAISE NOTICE 'permisos de itadaki_app repuestos';
END $$;
