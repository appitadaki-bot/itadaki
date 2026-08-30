import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { database } from './database';
import { type MigracionAplicada, pendientes } from './migraciones-pendientes';

/**
 * Que el esquema esté al día antes de aceptar pedidos.
 *
 * Sin esto, una migración sin aplicar no se nota al desplegar: la API arranca,
 * el health check pasa, y el deploy se ve verde. El fallo aparece más tarde, en
 * el teléfono de un comensal que quiso ver su cuenta, con un error de Postgres
 * que no se parece en nada a su causa —"column cobrado_minor does not exist"
 * cuando lo que falló fue no haber corrido las migraciones—.
 *
 * Nos pasó exactamente así: el código que separa los medios de cobro se
 * desplegó, la columna nunca se creó, y todas las mesas del restaurante vieron
 * "no pudimos abrir la cuenta" hasta que alguien lo miró.
 */

const DIRECTORIO = 'libs/shared/persistence/src/lib/migrations';

/**
 * Qué migraciones faltan correr contra esta base.
 *
 * Lee los archivos del repositorio y los cruza con el registro de la base. Un
 * fallo al leer devuelve la lista vacía: no poder averiguarlo no es lo mismo
 * que saber que falta algo, y tumbar el arranque por no haber podido mirar
 * dejaría al restaurante sin sistema por un problema que puede no existir.
 */
export async function migracionesQueFaltan(): Promise<readonly string[]> {
  try {
    const dir = join(process.cwd(), DIRECTORIO);
    const archivos = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();

    const registradas = await database.unscoped(async (client) => {
      const result = await client.query<MigracionAplicada>(
        'SELECT name, checksum FROM schema_migrations',
      );
      return result.rows;
    });

    return pendientes(archivos, registradas);
  } catch {
    // Sin registro —una base recién creada— o sin permiso para leerlo: que lo
    // diga el propio `db:migrate`, que es quien puede arreglarlo.
    return [];
  }
}

/**
 * Qué hacer con lo que falta.
 *
 * En producción se niega a arrancar: el orquestador deja sirviendo la versión
 * anterior, que anda, en vez de reemplazarla por una que va a fallar en cada
 * mesa. Es lo mismo que ya se hace cuando la base no responde.
 *
 * En una máquina de trabajo alcanza con avisar: quien está desarrollando sabe
 * que le falta correr las migraciones, y no poder levantar la API por eso
 * molesta más de lo que ayuda.
 */
export function comoTratarLasPendientes(
  faltan: readonly string[],
  nodeEnv: string | undefined,
): { readonly rompe: boolean; readonly mensaje: string } | null {
  if (faltan.length === 0) return null;

  const lista = faltan.join(', ');
  return {
    rompe: nodeEnv === 'production',
    mensaje:
      `faltan ${faltan.length} migraciones por aplicar (${lista}) — ` +
      'corré `npm run db:migrate` contra esta base antes de desplegar',
  };
}
