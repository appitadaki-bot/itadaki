-- Con qué se cobró de verdad, según el mozo.
--
-- El comensal ya declara cómo piensa pagar cuando pide la cuenta, pero eso es
-- una intención: dice tarjeta y termina pagando en efectivo, o cuatro
-- personas pagan cada una distinto. Un número que el dueño puede querer
-- cruzar con su caja tiene que venir de quien tuvo la plata en la mano.
--
-- Nulo en las cuentas cobradas antes de que esto existiera y en las que se
-- liberan sin cobrar: en las dos, nadie declaró nada y sería inventarlo.
ALTER TABLE bills ADD COLUMN IF NOT EXISTS cobrado_con text;

ALTER TABLE bills
  DROP CONSTRAINT IF EXISTS bills_cobrado_con_valido;

ALTER TABLE bills
  ADD CONSTRAINT bills_cobrado_con_valido
  CHECK (cobrado_con IS NULL OR cobrado_con IN ('CARD', 'CASH', 'COUNTER'));

-- El monto descontado, no el porcentaje: el porcentaje del local puede cambiar
-- mañana, y entonces las cuentas viejas dirían un descuento que no fue el que
-- se hizo.
ALTER TABLE bills ADD COLUMN IF NOT EXISTS descuento_minor integer NOT NULL DEFAULT 0;

-- Un descuento negativo sería un recargo, y eso no es lo que dice ninguna
-- pantalla que la mesa haya visto.
ALTER TABLE bills
  DROP CONSTRAINT IF EXISTS bills_descuento_no_negativo;

ALTER TABLE bills
  ADD CONSTRAINT bills_descuento_no_negativo
  CHECK (descuento_minor >= 0);

-- Buscar los cobros de un día por medio de pago es lo que hacen las métricas.
CREATE INDEX IF NOT EXISTS bills_cobrado_con
  ON bills (tenant_id, cobrado_con)
  WHERE cobrado_con IS NOT NULL;
