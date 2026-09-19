-- La caja: quien cobra, que no es quien atiende.
--
-- El mozo tenía `bills:close`, que es cobrar una mesa y también liberarla sin
-- cobrarla. Con eso cualquiera del salón podía, a las tres de la mañana y
-- desde su casa, marcar mesas como pagadas o hacerlas desaparecer. Y como la
-- cuenta no guardaba quién la cerró, al día siguiente no había forma de saber
-- quién fue.
--
-- Cobrar pasa a este rol. El mozo sigue atendiendo, moviendo comandas y viendo
-- lo que se debe: lo que no puede es cerrar la plata.
--
-- Se borra y se vuelve a crear, como la 039: las migraciones corren enteras en
-- cada despliegue y un ADD CONSTRAINT a secas falla la segunda vez.
ALTER TABLE staff_users DROP CONSTRAINT IF EXISTS staff_role_valid;

ALTER TABLE staff_users
  ADD CONSTRAINT staff_role_valid
  CHECK (role IN ('OWNER', 'MANAGER', 'KITCHEN', 'WAITER', 'CAJA', 'SOPORTE'));

COMMENT ON CONSTRAINT staff_role_valid ON staff_users IS
  'CAJA cobra y libera mesas; WAITER atiende y ya no cierra plata.';
