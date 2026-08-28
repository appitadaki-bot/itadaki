-- Cómo entra el personal que no tiene mail de trabajo.
--
-- Un mozo que empezó ayer no tiene un mail del restaurante: usaría el suyo
-- personal, no lo verificaría nunca, y quedaría dentro del sistema cuando
-- renuncie. Y el dueño no puede darlo de alta un viernes a las nueve si el
-- chico no tiene el teléfono a mano.
--
-- El dueño sigue entrando con mail y contraseña: es quien puede perder el
-- acceso a todo, quien recibe la factura y quien recupera por mail.
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS username text;

-- El PIN se guarda hasheado, igual que las contraseñas: una base filtrada no
-- puede entregar las llaves de ningún restaurante.
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS pin_hash text;

-- Único dentro del restaurante, no en toda la base: dos locales distintos
-- pueden tener cada uno su "nico", y obligarlos a inventar nombres raros por
-- culpa de otro cliente no tendría sentido.
--
-- Parcial: las cuentas que entran con mail no tienen usuario, y varios NULL
-- romperían un índice único común.
CREATE UNIQUE INDEX IF NOT EXISTS staff_username_por_local
  ON staff_users (tenant_id, username)
  WHERE username IS NOT NULL;

-- Cuántos intentos fallidos lleva, y hasta cuándo está trabada.
--
-- Se traba la cuenta y no la dirección de red: quien prueba PINes a ciegas
-- cambia de IP cuando quiere, pero no cambia de usuario. Con seis dígitos hay
-- un millón de combinaciones y cinco intentos cada quince minutos son unos
-- cuatrocientos ochenta por día: llevaría años, y el dueño lo ve venir.
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS pin_intentos smallint NOT NULL DEFAULT 0;
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS pin_trabado_hasta timestamptz;

-- Buscar por usuario es lo que hace el login del personal.
CREATE INDEX IF NOT EXISTS staff_username_lookup
  ON staff_users (tenant_id, username)
  WHERE username IS NOT NULL;
