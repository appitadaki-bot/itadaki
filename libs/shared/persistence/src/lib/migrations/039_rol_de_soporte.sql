-- El rol con el que entramos a armarle la carta a un local nuevo.
--
-- La promesa del alta es "cuando entres, tu carta ya va a estar cargada", y
-- eso exige entrar antes que el dueño. La alternativa era pedirle su
-- contraseña: viajaría por WhatsApp, quedaría en dos historiales, y después
-- nadie sabría si un precio lo cambió él o nosotros.
--
-- Sólo puede leer y escribir la carta. No ve la facturación ni las ventas y
-- no toca al personal: si la cuenta se filtra, lo peor que puede pasar es una
-- carta mal cargada.
--
-- Se borra y se vuelve a crear, como la 032: las migraciones corren enteras
-- en cada despliegue y un ADD CONSTRAINT a secas falla la segunda vez.
ALTER TABLE staff_users DROP CONSTRAINT IF EXISTS staff_role_valid;

ALTER TABLE staff_users
  ADD CONSTRAINT staff_role_valid
  CHECK (role IN ('OWNER', 'MANAGER', 'KITCHEN', 'WAITER', 'SOPORTE'));

COMMENT ON CONSTRAINT staff_role_valid ON staff_users IS
  'SOPORTE es nuestro, no del restaurante: entra a cualquiera pero sólo toca la carta.';
