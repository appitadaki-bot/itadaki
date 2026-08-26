-- Hasta cuándo está pago el servicio.
--
-- Antes `paid` era un booleano sin vencimiento: una vez puesto en true, el
-- restaurante quedaba al día para siempre. Dejar de pagar no tenía efecto a
-- menos que llegara un aviso de baja, y esos avisos se pierden — el cobrador
-- reintenta, la red falla, el webhook se cae.
--
-- Con una fecha, no pagar tiene efecto solo: cada cobro aprobado la empuja un
-- mes hacia adelante, y si dejan de entrar, vence sin que nadie tenga que
-- hacer nada. Es la diferencia entre un permiso que hay que quitar y uno que
-- hay que renovar.
--
-- `paid` se queda: es lo que distingue "nos paga" de "le regalamos el
-- servicio", y esa segunda es una decisión nuestra que no vence.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS paid_until timestamptz;

-- El plan que contrató, para cuando haya más de uno. Nulo mientras está en
-- el trial: todavía no eligió nada.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan text;

-- La suscripción del lado del cobrador, para poder consultarla o darla de
-- baja sin buscar a mano en su panel.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_id text;

-- Los avisos ya aplicados.
--
-- El cobrador reintenta un webhook hasta que le contestamos que sí, y a veces
-- manda el mismo dos veces aunque le hayamos contestado. Sin esto, un
-- reintento de un cobro aprobado sumaría otro mes gratis.
CREATE TABLE IF NOT EXISTS billing_events (
  reference   text PRIMARY KEY,
  tenant_id   text NOT NULL,
  status      text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_events_tenant ON billing_events (tenant_id, received_at DESC);
