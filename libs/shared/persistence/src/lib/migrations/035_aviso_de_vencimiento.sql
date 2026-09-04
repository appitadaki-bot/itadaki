-- Cuándo se le avisó por correo que la suscripción venció.
--
-- El aviso sale de un proceso que corre todos los días. Sin dejar constancia,
-- el mismo restaurante recibiría el mismo correo cada mañana durante la semana
-- de gracia, que es la forma más rápida de que alguien mande a spam justamente
-- el mail que necesita leer.
--
-- Se borra al renovar: si vuelve a vencer, vuelve a avisarse.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS vencimiento_avisado_at timestamptz;

COMMENT ON COLUMN tenants.vencimiento_avisado_at IS
  'Cuándo salió el correo de vencimiento. Null si no se avisó por este vencimiento.';
