-- Con qué se cobró, ahora separando crédito, débito y transferencia.
--
-- Antes había un solo 'CARD'. No alcanza: al dueño el crédito le cobra más
-- comisión que el débito y se le acredita más tarde, y la transferencia le
-- entra casi entera pero la tiene que conciliar a mano. Un único número de
-- "tarjeta" esconde justamente lo que querría mirar.
--
-- Las cuentas viejas se dejan con 'CARD'. No hay forma de saber si fueron
-- crédito o débito, y adivinarlo mancharía el número que el dueño cruza con
-- su caja. Por eso el CHECK lo sigue aceptando aunque ninguna pantalla lo
-- vuelva a escribir.
ALTER TABLE bills
  DROP CONSTRAINT IF EXISTS bills_cobrado_con_valido;

ALTER TABLE bills
  ADD CONSTRAINT bills_cobrado_con_valido
  CHECK (
    cobrado_con IS NULL
    OR cobrado_con IN ('CASH', 'DEBIT', 'CREDIT', 'TRANSFER', 'COUNTER', 'CARD')
  );

-- Cuánto entró con esa cuenta, congelado al cobrar.
--
-- El total sale de `lines`, que es jsonb: sumarlo en cada consulta obliga a
-- desarmar el JSON de todas las cuentas del período, y ese es exactamente el
-- número que las métricas piden. Se guarda al cerrar, junto al medio, porque
-- es el momento en que se sabe y porque después no tiene que cambiar: una
-- cuenta cobrada es un hecho, y un total recalculado meses más tarde con
-- precios distintos ya no sería lo que entró en la caja.
--
-- Cero en las cuentas cobradas antes de que esto existiera: sus totales
-- siguen en `lines` para la pantalla de la cuenta, pero no se pueden atribuir
-- a un medio, que es lo único que esta columna sirve para responder.
ALTER TABLE bills ADD COLUMN IF NOT EXISTS cobrado_minor integer NOT NULL DEFAULT 0;

ALTER TABLE bills
  DROP CONSTRAINT IF EXISTS bills_cobrado_no_negativo;

ALTER TABLE bills
  ADD CONSTRAINT bills_cobrado_no_negativo
  CHECK (cobrado_minor >= 0);
