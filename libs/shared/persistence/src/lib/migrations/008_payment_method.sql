-- How the table means to pay, asked when they request the bill.
--
-- Its own column rather than free text in `note`: the waiter needs to see at a
-- glance whether to carry the card reader, and a sentence is something you
-- read rather than something you spot.

ALTER TABLE table_calls
  ADD COLUMN IF NOT EXISTS payment_method text;

-- Sólo si no está. Las migraciones vuelven a correr todas en cada despliegue,
-- así que este archivo se aplica de nuevo sobre bases donde la 013 ya amplió
-- esta misma restricción para aceptar COUNTER. Soltarla y reponer la lista
-- vieja hacía fallar la migración entera contra cualquier base con una mesa
-- que hubiera dicho que pagaba en la caja: la fila existente ya no entraba en
-- la restricción que este archivo intentaba reponer.
--
-- Quien manda sobre la forma final es el archivo más nuevo. Este pone la lista
-- que corresponde a una base que recién se crea, y no vuelve a opinar después.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'call_payment_valid'
      AND conrelid = 'table_calls'::regclass
  ) THEN
    ALTER TABLE table_calls
      ADD CONSTRAINT call_payment_valid
      CHECK (payment_method IS NULL OR payment_method IN ('CARD', 'CASH', 'UNDECIDED'));
  END IF;
END $$;
