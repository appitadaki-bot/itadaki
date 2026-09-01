-- Los medios que la mesa puede declarar al pedir la cuenta.
--
-- La restricción sólo aceptaba 'CARD', 'CASH', 'COUNTER' y 'UNDECIDED', que
-- eran las opciones cuando débito y crédito iban juntos. Al unificar el
-- vocabulario con el que confirma el mozo, la mesa pasó a poder elegir
-- transferencia, débito y crédito — y Postgres rechazaba la fila.
--
-- El comensal veía un 502 al tocar "transferencia": un error de servidor sin
-- explicación, en la pantalla donde está pidiendo la cuenta.
--
-- 'CARD' y 'COUNTER' se conservan aunque ninguna pantalla los vuelva a
-- escribir: están en los llamados ya guardados, y sacarlos de la restricción
-- haría fallar cualquier actualización sobre esas filas.
ALTER TABLE table_calls
  DROP CONSTRAINT IF EXISTS call_payment_valid;

ALTER TABLE table_calls
  ADD CONSTRAINT call_payment_valid
  CHECK (
    payment_method IS NULL
    OR payment_method IN (
      'CASH', 'DEBIT', 'CREDIT', 'TRANSFER', 'UNDECIDED',
      -- Los de antes, para las filas que ya existen.
      'CARD', 'COUNTER'
    )
  );
