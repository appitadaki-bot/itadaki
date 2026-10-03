-- Trabar la cuenta después de varios intentos con la contraseña.
--
-- El PIN del personal ya se trababa así desde la 029: cinco fallidos seguidos
-- y quince minutos de espera. El login con mail y contraseña no tenía nada de
-- eso — sólo un tope de diez intentos cada quince minutos **por dirección de
-- red**, que es justo lo que esquiva cualquiera que rote IPs, mientras que la
-- cuenta a la que apunta sigue siendo la misma.
--
-- Columnas aparte de las del PIN y no las mismas: son dos credenciales
-- distintas de la misma persona. El mozo que se equivoca el PIN en el salón no
-- tiene por qué trabarle al dueño la entrada al panel, ni al revés.
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS clave_intentos smallint NOT NULL DEFAULT 0;
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS clave_trabada_hasta timestamptz;

-- La búsqueda de login tiene que devolverlas: entrar pasa por acá antes de
-- saber de qué restaurante se trata, así que es el único lugar donde se puede
-- leer el estado de la cuenta sin tener el local en contexto.
--
-- `DROP` y no `CREATE OR REPLACE`: Postgres no deja cambiarle el tipo de
-- retorno a una función existente. Al recrearla se pierde el permiso que le
-- dio la 038, así que se vuelve a otorgar más abajo.
DROP FUNCTION IF EXISTS staff_login_lookup_fn(text);

CREATE FUNCTION staff_login_lookup_fn(p_email text)
RETURNS TABLE (
  tenant_id           text,
  id                  text,
  email               text,
  display_name        text,
  password_hash       text,
  role                text,
  active              boolean,
  clave_intentos      smallint,
  clave_trabada_hasta timestamptz
)
-- plpgsql y no sql, por lo mismo que explica la 009: una función `LANGUAGE
-- sql` se valida contra las políticas vigentes al crearla, antes de que su
-- propio ajuste tenga efecto, y la creación falla.
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
    SELECT s.tenant_id, s.id, s.email, s.display_name, s.password_hash, s.role, s.active,
           s.clave_intentos, s.clave_trabada_hasta
    FROM staff_users s
    WHERE lower(s.email) = lower(p_email)
      AND s.active
    LIMIT 1;

  PERFORM set_config('app.tenant_id', COALESCE(anterior, ''), true);
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'itadaki_app') THEN
    GRANT EXECUTE ON FUNCTION staff_login_lookup_fn(text) TO itadaki_app;
  END IF;
END $$;
