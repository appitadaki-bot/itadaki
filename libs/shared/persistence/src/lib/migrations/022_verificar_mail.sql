-- Verificar que el mail sea de quien dice.
--
-- Sin esto, cualquiera se registra con el mail de otro: se queda con el
-- nombre de un restaurante que no es suyo, y el dueño real no puede usar su
-- propio mail porque figura como tomado. Y del otro lado, un tipeo en el mail
-- deja al dueño sin forma de recuperar la contraseña — el link de
-- recuperación se manda a una casilla que no lee nadie.
--
-- El token se guarda hasheado, igual que el de recuperación: la fila de la
-- base no puede alcanzar para verificar una cuenta ajena.

ALTER TABLE staff ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS verify_digest text;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS verify_expires_at timestamptz;

-- Buscar por el hash del token es lo que hace el link del mail, así que va
-- indexado. Parcial: sólo las filas que tienen una verificación pendiente,
-- que son unas pocas entre todas las cuentas.
CREATE INDEX IF NOT EXISTS staff_verify_digest
  ON staff (verify_digest)
  WHERE verify_digest IS NOT NULL;

-- Las cuentas que ya existen quedan verificadas: se dieron de alta a mano,
-- hablando con cada restaurante, así que el mail ya está confirmado por otra
-- vía. Pedirles que verifiquen ahora sería trabarles el panel por un requisito
-- que no existía cuando se anotaron.
UPDATE staff SET email_verified_at = now() WHERE email_verified_at IS NULL;
