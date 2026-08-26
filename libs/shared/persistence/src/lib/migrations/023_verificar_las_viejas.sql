-- Marcar como verificadas las cuentas que ya existían.
--
-- La 022 lo intentaba con un UPDATE suelto, y ese UPDATE no tocó nada: con RLS
-- en FORCE la política alcanza también al dueño de la tabla, así que una
-- consulta sin `app.tenant_id` en alcance no ve ninguna fila — y no falla, que
-- es lo que la hace difícil de notar. Reporta cero filas y sigue.
--
-- Acá se recorre el directorio de restaurantes, que no está filtrado, y se
-- fija el alcance en cada vuelta. Es el mismo patrón que usan las tareas de
-- limpieza que cruzan restaurantes.
--
-- Sin esto, las cuentas que se dieron de alta a mano quedan sin verificar por
-- un requisito que no existía cuando se anotaron.

DO $$
DECLARE
  local_id text;
BEGIN
  FOR local_id IN SELECT id FROM tenants LOOP
    PERFORM set_config('app.tenant_id', local_id, true);

    UPDATE staff_users
       SET email_verified_at = now()
     WHERE email_verified_at IS NULL;
  END LOOP;
END $$;
