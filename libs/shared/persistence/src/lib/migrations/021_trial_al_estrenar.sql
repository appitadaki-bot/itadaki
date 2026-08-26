-- El trial arranca con el primer pedido, no al crear la cuenta.
--
-- Con el alta manual el reloj arrancaba bien: la cuenta se creaba después de
-- hablar con el restaurante y cargarle la carta, o sea cuando ya podía usarla.
-- Con el alta automática eso deja de ser cierto — quien se anota un martes y
-- recibe la carta cargada el jueves perdía dos días de los treinta, y el que
-- más esperaba era justamente el que más ganas tenía.
--
-- `trial_ends_at` en NULL pasa a significar "todavía no arrancó" para las
-- cuentas nuevas. Las viejas también lo tienen en NULL y no se pueden
-- distinguir por ahí, así que la diferencia la marca esta columna: las
-- existentes quedan marcadas como estrenadas y siguen exactamente como están.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS estrenado boolean NOT NULL DEFAULT true;

-- Cuándo se estrenó, para poder mirar después cuánto tarda un restaurante en
-- arrancar. Nulo en las cuentas viejas: no sabemos cuándo fue.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS estrenado_at timestamptz;

-- De acá en adelante, una cuenta nueva nace sin estrenar. El DEFAULT anterior
-- ya marcó las existentes en true, así que este cambio sólo afecta a las que
-- vengan.
ALTER TABLE tenants ALTER COLUMN estrenado SET DEFAULT false;
