-- Dos tablas que la 037 dejó sin poder leerse.
--
-- La 037 recorre cualquier tabla con columna `tenant_id` y le activa RLS más
-- la política `tenant_isolation`, sin excepciones, para cubrir tablas nuevas
-- sin tener que acordarse de cada una a mano. Pero dos tablas existentes se
-- leen y escriben justamente ANTES de saber a qué tenant pertenecen, con
-- `db.unscoped()` y sin `app.tenant_id` fijado — no por descuido, es la razón
-- de que existan:
--
--   * `password_resets` (004): el link de "Olvidé mi contraseña" se busca por
--     `token_digest` solo, porque en ese momento nadie inició sesión todavía.
--     La 004 ya lo decía: "this table cannot be read through a tenant-scoped
--     connection... every row is found by a digest nobody can guess". Desde
--     la 037, ese SELECT/UPDATE corre con la política activa y sin
--     `app.tenant_id`, así que no encuentra la fila aunque el token sea
--     válido: todo reset de contraseña, de cualquier restaurante, falla con
--     "el link venció o ya se usó" sin haber vencido ni haberse usado.
--
--   * `billing_events` (020): el webhook de Mercado Pago registra el aviso
--     por `reference` antes de saber el tenant, para no aplicar el mismo pago
--     dos veces. Desde la 037, ese INSERT viola la política —el
--     `WITH CHECK` no puede matchear un `app.tenant_id` que nunca se fija— y
--     tira una excepción. `billing.controller.ts` trata cualquier error de
--     `registrarAviso` igual que "este aviso ya se procesó" y no aplica el
--     pago: desde que la 037 llegó a producción, un cobro aprobado no extiende
--     la suscripción y un reembolso no corta el servicio. Ningún pago se
--     pierde en Mercado Pago, pero el efecto en la cuenta del restaurante
--     nunca se aplica.
--
-- Ninguna de las dos usa RLS como su seguridad: `password_resets` se protege
-- con un digest de 32 bytes al azar, y `billing_events` con la referencia que
-- da el medio de pago. Vuelven a quedar afuera del aislamiento por tenant, tal
-- como ya está `tenants` — se leen antes de saber de cuál es.
ALTER TABLE password_resets DISABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events DISABLE ROW LEVEL SECURITY;

-- Sin esto, un futuro `ALTER ... FORCE ROW LEVEL SECURITY` sin querer no
-- vuelve a exigir una política que estas dos tablas no pueden cumplir.
ALTER TABLE password_resets NO FORCE ROW LEVEL SECURITY;
ALTER TABLE billing_events NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON password_resets;
DROP POLICY IF EXISTS tenant_isolation ON billing_events;
