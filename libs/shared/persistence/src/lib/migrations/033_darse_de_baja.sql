-- Cuándo el restaurante pidió darse de baja.
--
-- La landing promete "te damos de baja cuando quieras, desde tu panel" y eso
-- no existía: la única forma era escribirnos. Prometer una salida fácil y no
-- darla es peor que no prometerla — quien quiere irse y no puede lo cuenta.
--
-- Es una fecha y no un booleano porque la baja no corta el acceso: el mes ya
-- está pagado, así que el sistema sigue andando hasta que termine. Guardar
-- cuándo lo pidió permite decirle hasta cuándo le queda, y distinguir a quien
-- se dio de baja de quien nunca pagó.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- Volver a suscribirse la borra: es la misma cuenta, no una nueva.
COMMENT ON COLUMN tenants.cancelled_at IS
  'Cuándo pidió la baja. El acceso sigue hasta paid_until; null si está activo.';
