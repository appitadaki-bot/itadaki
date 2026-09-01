-- El usuario del personal, único en toda la base.
--
-- La migración 029 lo hizo único por restaurante, con este razonamiento: dos
-- locales distintos pueden tener cada uno su "nico", y obligarlos a inventar
-- nombres raros por culpa de otro cliente no tendría sentido.
--
-- Lo que ese razonamiento no vio es el mozo que trabaja en dos lugares, que en
-- gastronomía es lo normal y no la excepción. Con usuarios por local, esa
-- persona tiene dos cuentas que no se conocen entre sí: dos PIN que recordar,
-- y ningún lugar donde ver en cuál de los dos trabaja hoy.
--
-- Y hay algo peor. Con el usuario repetido entre locales, "nico" no identifica
-- a nadie: quien prueba PINes contra un restaurante está probando contra un
-- usuario que también existe en otros veinte, y el bloqueo de una cuenta no
-- protege a las demás. Un usuario único es una identidad; uno por local es una
-- etiqueta que se repite.
--
-- El costo es real y se paga una vez: el segundo "nico" que se dé de alta va a
-- tener que ser "nico.parrilla" o "nico2". El alta lo resuelve sola, sugiriendo
-- uno libre.
ALTER TABLE staff_users
  DROP CONSTRAINT IF EXISTS staff_username_por_local;

DROP INDEX IF EXISTS staff_username_por_local;

-- En minúscula: el usuario se dicta en voz alta —"entrá con nico"— y nadie
-- aclara mayúsculas. Sin esto, "Nico" y "nico" serían dos personas.
CREATE UNIQUE INDEX IF NOT EXISTS staff_username_unico
  ON staff_users (lower(username))
  WHERE username IS NOT NULL;

-- Buscar por usuario sin saber el restaurante: es lo que hace el login ahora,
-- porque el usuario ya no depende del local.
DROP INDEX IF EXISTS staff_username_lookup;

CREATE INDEX IF NOT EXISTS staff_username_global
  ON staff_users (lower(username))
  WHERE username IS NOT NULL;

-- Buscar al personal por su usuario, sin saber de qué restaurante es.
--
-- El mismo problema que el login por mail, y por eso la misma solución: pasa
-- antes de saber el local, así que no puede estar filtrada por app.tenant_id.
-- Reusa la política `login_lookup` de la migración 009, que ya describe el
-- único acceso legítimo sin restaurante.
--
-- Devuelve todas las filas de ese usuario, no una: la gracia de que el usuario
-- sea único es que la misma persona puede estar en varios locales, y el login
-- necesita verlos todos para preguntarle en cuál entra.
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
           s.username, s.pin_hash, s.pin_intentos, s.pin_trabado_hasta
      FROM staff_users s
     WHERE lower(s.username) = lower(p_username)
       AND s.active;

  PERFORM set_config('app.tenant_id', COALESCE(anterior, ''), true);
END;
$$;

REVOKE ALL ON FUNCTION staff_username_lookup_fn(text) FROM PUBLIC;

-- Con guarda: el rol de la aplicación no existe en una base recién creada, y
-- sin esto la migración entera aborta con "role does not exist".
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'itadaki_app') THEN
    GRANT EXECUTE ON FUNCTION staff_username_lookup_fn(text) TO itadaki_app;
  END IF;
END $$;
