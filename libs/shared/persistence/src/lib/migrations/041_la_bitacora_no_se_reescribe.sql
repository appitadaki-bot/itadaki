-- La bitácora de la carta, que no se pueda reescribir.
--
-- La 040 le dio al rol de la app SELECT e INSERT y nada más, a propósito: es
-- un registro de quién cambió qué, y sirve justamente cuando hay que revisar a
-- alguien con permisos. Pero un GRANT suma y no resta, y la 038 ya había dejado
-- puesto un ALTER DEFAULT PRIVILEGES que le da SELECT, INSERT, UPDATE y DELETE
-- a toda tabla que se cree después. carta_bitacora nace en la 040, o sea
-- después, así que heredó los cuatro y el GRANT acotado de la 040 no quitó nada.
--
-- Hoy no hay ninguna ruta que borre de esta tabla —lo único que la toca es un
-- INSERT y un SELECT— así que no se pierde nada. Lo que se cierra es que la
-- bitácora deje de servir de prueba el día que haga falta.
--
-- Va después de la 040 por el nombre, que es como corren.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'itadaki_app') THEN
    EXECUTE 'REVOKE UPDATE, DELETE ON carta_bitacora FROM itadaki_app';
  END IF;
END
$$;
