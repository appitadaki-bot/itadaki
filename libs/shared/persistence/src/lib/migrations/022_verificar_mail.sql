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

ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS verify_digest text;
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS verify_expires_at timestamptz;

-- Buscar por el hash del token es lo que hace el link del mail, así que va
-- indexado. Parcial: sólo las filas que tienen una verificación pendiente,
-- que son unas pocas entre todas las cuentas.
CREATE INDEX IF NOT EXISTS staff_verify_digest
  ON staff_users (verify_digest)
  WHERE verify_digest IS NOT NULL;

-- Las cuentas que ya existen se marcan verificadas en la 023, que recorre los
-- restaurantes uno por uno. Acá no se puede: con RLS en FORCE un UPDATE sin
-- `app.tenant_id` en alcance no ve ninguna fila, y lo peor es que no falla —
-- reporta cero filas y sigue, así que parece que funcionó.
