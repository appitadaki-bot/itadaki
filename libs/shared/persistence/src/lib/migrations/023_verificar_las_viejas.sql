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
--
-- La condición del `verify_digest` es lo que hace que esto pase una sola vez.
-- Las migraciones vuelven a correr enteras en cada despliegue, así que un
-- UPDATE sobre "toda cuenta sin verificar" no marcaría las viejas: marcaría
-- las que estén esperando el click en ese momento. Alguien se anota el martes,
-- no abre el mail, se despliega el miércoles y su cuenta queda verificada
-- sola — la verificación entera deja de servir y nada lo delata.
--
-- Una cuenta anotada con el sistema nuevo tiene su token esperando, así que
-- tiene `verify_digest`. Las viejas no lo tienen: la columna no existía cuando
-- se crearon. Esa diferencia separa exactamente los dos grupos, y al segundo
-- despliegue ya no queda ninguna fila que tocar.

DO $$
DECLARE
  local_id text;
BEGIN
  FOR local_id IN SELECT id FROM tenants LOOP
    PERFORM set_config('app.tenant_id', local_id, true);

    UPDATE staff_users
       SET email_verified_at = now()
     WHERE email_verified_at IS NULL
       AND verify_digest IS NULL;
  END LOOP;
END $$;
