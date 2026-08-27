-- Dónde deja la reseña el comensal, y cuántas veces se la pedimos.
--
-- El link lo copia el dueño de su panel de Google: abre el formulario ya
-- cargado sobre su ficha. Buscar el restaurante a mano pierde a la mayoría en
-- el camino, y la mitad termina calificando otro local con nombre parecido.
--
-- Nulo por defecto: nadie ve el pedido de reseña hasta que alguien lo
-- configura.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS google_review_url text;

-- Cuántas veces se ofreció y cuántas se tocó.
--
-- Es lo único que podemos medir sin pedirle permiso a Google sobre la ficha
-- del negocio, y responde la pregunta que importa: si esto sirve o si el
-- botón lo ignoran. Cuántas reseñas entraron de verdad lo ve el dueño en su
-- propio Google, y decirlo acá seria inventar un número.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS review_asks integer NOT NULL DEFAULT 0;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS review_taps integer NOT NULL DEFAULT 0;

-- Los contadores sólo suben. Un valor negativo sería un error de cálculo
-- nuestro, y es mejor que falle al escribir que ver un porcentaje absurdo.
ALTER TABLE tenants
  DROP CONSTRAINT IF EXISTS tenants_review_counts_no_negativos;

ALTER TABLE tenants
  ADD CONSTRAINT tenants_review_counts_no_negativos
  CHECK (review_asks >= 0 AND review_taps >= 0);
