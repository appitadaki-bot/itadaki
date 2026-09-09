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
): QueHacer | null {
  if (sinAislar.length === 0) return null;

  const cuales = sinAislar.map((una) => una.tabla).join(', ');
  const mensaje =
    `sin aislamiento entre restaurantes en: ${cuales}. ` +
    'Las consultas de cada restaurante confían en row level security para filtrar, ' +
    'así que sin esto un panel puede mostrar los datos de otro local. ' +
    'Correr db:migrate contra esta base.';

  return { mensaje, rompe: entorno === 'production' };
}
