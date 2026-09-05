-- El personal no podía entrar con su usuario y PIN.
--
-- La 029 crea `pin_intentos` como `smallint` y la 031 declaró la función que
-- busca por usuario devolviendo `integer`. Postgres no lo convierte solo:
-- aborta la consulta entera con "structure of query does not match function
-- result type", así que la búsqueda fallaba antes de mirar ningún PIN.
--
-- Para quien lo vivía era peor que un error: el alta mostraba usuario y PIN
-- recién generados, y esas credenciales no servían. El mozo probaba, no
-- entraba, y lo lógico era pensar que se había copiado mal el número. El
-- dueño no lo notaba nunca, porque él entra con mail y contraseña — el
-- login por mail usa otra función, que no devuelve esta columna.
--
-- Se convierte en la consulta en vez de cambiar el tipo declarado: el que
-- corresponde de verdad es `integer` —es lo que la aplicación espera— y
-- dejarlo así hace que un cambio futuro en la columna no vuelva a romper
-- esto en silencio.
CREATE OR REPLACE FUNCTION staff_username_lookup_fn(p_username text)
RETURNS TABLE (
  tenant_id        text,
  id               text,
  email            text,
  display_name     text,
  role             text,
  active           boolean,
  username         text,
  pin_hash         text,
  pin_intentos     integer,
  pin_trabado_hasta timestamptz
)
-- plpgsql y no sql, por lo mismo que la 009: una función `LANGUAGE sql` se
-- valida contra las políticas vigentes al crearla y la creación falla.
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  anterior text := current_setting('app.tenant_id', true);
BEGIN
  PERFORM set_config('app.tenant_id', '__login__', true);

  RETURN QUERY
    SELECT s.tenant_id, s.id, s.email, s.display_name, s.role, s.active,
           s.username, s.pin_hash,
           -- El cast que faltaba.
           s.pin_intentos::integer, s.pin_trabado_hasta
      FROM staff_users s
     WHERE lower(s.username) = lower(p_username)
       AND s.active;

  PERFORM set_config('app.tenant_id', COALESCE(anterior, ''), true);
END;
$$;

REVOKE ALL ON FUNCTION staff_username_lookup_fn(text) FROM PUBLIC;

-- Con guarda, como la 031: el rol de la aplicación no existe en una base
-- recién creada, y sin esto la migración entera aborta con "role does not
-- exist".
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'itadaki_app') THEN
    GRANT EXECUTE ON FUNCTION staff_username_lookup_fn(text) TO itadaki_app;
  END IF;
END $$;
