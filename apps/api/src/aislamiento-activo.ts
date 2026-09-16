import { database } from './database';

/**
 * Que el aislamiento entre restaurantes esté puesto antes de aceptar pedidos.
 *
 * Las consultas de cada restaurante no llevan `WHERE tenant_id`: el filtro lo
 * hace la política de row level security de cada tabla. Es una sola barrera, y
 * cuando falta no falla nada — devuelve de más. Un panel mostraba los mozos de
 * otro restaurante y todo lo demás parecía andar bien.
 *
 * Por eso se mira al arrancar y no se confía en que la migración haya corrido:
 * una base creada antes de que se agregaran esas líneas se quedó sin ellas, y
 * el registro de migraciones la daba por al día igual.
 */
export interface TablaSinAislar {
  readonly tabla: string;
  readonly activo: boolean;
  readonly forzado: boolean;
}

/**
 * Las tablas de restaurantes que no tienen el candado puesto.
 *
 * `FORCE` además de `ENABLE`: sin él, el dueño de la tabla ve todas las filas,
 * y la API se conecta con un rol que en Neon y en Render es el dueño.
 */
const CONSULTA = `
  SELECT c.relname AS tabla,
         c.relrowsecurity AS activo,
         c.relforcerowsecurity AS forzado
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind = 'r'
     AND EXISTS (
           SELECT 1
             FROM information_schema.columns col
            WHERE col.table_schema = 'public'
              AND col.table_name = c.relname
              AND col.column_name = 'tenant_id'
         )
     AND (c.relrowsecurity IS NOT TRUE OR c.relforcerowsecurity IS NOT TRUE)
   ORDER BY c.relname
`;

/**
 * Un fallo al mirar devuelve la lista vacía.
 *
 * No poder averiguarlo no es lo mismo que saber que falta: tumbar el arranque
 * por no haber podido mirar dejaría al restaurante sin sistema por un problema
 * que puede no existir. Lo mismo que hace el chequeo de migraciones.
 */
export async function tablasSinAislar(): Promise<readonly TablaSinAislar[]> {
  try {
    return await database.unscoped(async (client) => {
      const { rows } = await client.query<TablaSinAislar>(CONSULTA);
      return rows;
    });
  } catch {
    return [];
  }
}

/**
 * Si el rol con el que conecta la API puede saltearse el aislamiento.
 *
 * Tener el candado puesto en cada tabla no alcanza: un rol superusuario o con
 * `BYPASSRLS` ve todas las filas igual, y las consultas de cada restaurante no
 * llevan `WHERE tenant_id` porque confían en la política. Con un rol así, el
 * panel de un local muestra los datos de otro y nada falla.
 *
 * Se mira al arrancar porque depende de con qué credencial arrancó el
 * servicio, no del esquema: mudarse de proveedor —o que alguien cambie la
 * cadena de conexión por la del dueño de la base— lo cambia sin tocar una
 * migración. Supabase es el caso concreto: su rol `postgres` tiene permisos
 * amplios y hay que mirar cuál se usa.
 *
 * Un fallo al mirar responde `false`, igual que el resto de este archivo: no
 * poder averiguarlo no es lo mismo que saber que está mal.
 */
export async function elRolSalteaElAislamiento(): Promise<boolean> {
  try {
    return await database.unscoped(async (client) => {
      const { rows } = await client.query<{ saltea: boolean }>(
        `SELECT (rolsuper OR rolbypassrls) AS saltea
           FROM pg_roles
          WHERE rolname = current_user`,
      );
      return rows[0]?.saltea === true;
    });
  } catch {
    return false;
  }
}

export interface QueHacer {
  readonly mensaje: string;
  readonly rompe: boolean;
}

/**
 * Qué hacer con las tablas sin aislar, según dónde corre esto.
 *
 * En un servidor rompe el arranque: seguir sirviendo la versión anterior es
 * mejor que atender con los datos de todos mezclados. En una máquina de
 * desarrollo avisa y sigue — quien está probando con un solo restaurante no
 * tiene por qué quedarse sin API.
 */
export function comoTratarLoSinAislar(
  sinAislar: readonly TablaSinAislar[],
  entorno: string | undefined,
  rolSaltea = false,
): QueHacer | null {
  if (sinAislar.length === 0 && !rolSaltea) return null;

  const porque: string[] = [];

  if (rolSaltea) {
    porque.push(
      'el rol con el que se conecta puede saltear row level security ' +
        '(es superusuario o tiene BYPASSRLS), así que el candado de las tablas no lo frena. ' +
        'Usar un rol sin ese permiso en DATABASE_URL',
    );
  }

  if (sinAislar.length > 0) {
    porque.push(
      `no está puesto el candado en: ${sinAislar.map((una) => una.tabla).join(', ')}. ` +
        'Correr db:migrate contra esta base',
    );
  }

  const mensaje =
    'sin aislamiento entre restaurantes — ' +
    `${porque.join('; y ')}. ` +
    'Las consultas de cada restaurante confían en row level security para filtrar, ' +
    'así que sin esto un panel puede mostrar los datos de otro local.';

  return { mensaje, rompe: entorno === 'production' };
}
