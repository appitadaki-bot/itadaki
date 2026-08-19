-- Una mesa puede ser de varios mozos.
--
-- La clave anterior era (tenant_id, table_id): una mesa, un mozo. Eso obligaba
-- a rehacer el reparto cada vez que cambiaba algo, que es justo lo que el
-- turno vino a evitar. En un salón real dos mozos comparten el sector del
-- fondo, o el encargado cubre unas mesas además de las suyas.
--
-- Sigue habiendo una fila por par mesa-mozo, así que asignar dos veces al
-- mismo no duplica.
ALTER TABLE table_assignments DROP CONSTRAINT IF EXISTS table_assignments_pkey;
ALTER TABLE table_assignments
  ADD CONSTRAINT table_assignments_pkey PRIMARY KEY (tenant_id, table_id, staff_id);
