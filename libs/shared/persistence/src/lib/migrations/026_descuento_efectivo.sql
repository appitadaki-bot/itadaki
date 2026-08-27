-- El descuento que el local hace por pagar en efectivo.
--
-- Es una práctica común acá: el restaurante se ahorra la comisión de la
-- tarjeta y comparte parte de eso con quien paga en efectivo. Hasta ahora se
-- arreglaba de palabra en la mesa, así que el comensal se enteraba —o no—
-- cuando ya había decidido cómo pagar.
--
-- En puntos porcentuales enteros y no como fracción: el dueño escribe "10" en
-- el panel, y un entero no arrastra los errores de redondeo que tendría un
-- 0.1 guardado como decimal binario.
--
-- Cero es lo que hay por defecto, y significa que el local no lo ofrece: esto
-- no aparece en ninguna pantalla hasta que alguien lo configura.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS cash_discount_percent smallint NOT NULL DEFAULT 0;

-- El tope no es una regla del negocio sino una red: quien quiso poner 10 y
-- puso 100 se entera al guardar, y no cuando la primera mesa paga casi nada.
ALTER TABLE tenants
  DROP CONSTRAINT IF EXISTS tenants_cash_discount_range;

ALTER TABLE tenants
  ADD CONSTRAINT tenants_cash_discount_range
  CHECK (cash_discount_percent BETWEEN 0 AND 50);
