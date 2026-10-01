import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CARPETA = join(__dirname, 'migrations');

/**
 * Toda tabla con `tenant_id` se ata sola a su restaurante. O no se ata nunca.
 *
 * Dos migraciones hicieron el trabajo una vez: la 018 recorrió la base y ató
 * cada tabla con `tenant_id` a `tenants` con `ON DELETE CASCADE`, y la 037
 * hizo lo mismo con el aislamiento por fila. Las dos dicen en su comentario
 * que una tabla nueva "se ata sola la próxima vez que corran las
 * migraciones", y eso es falso: el registro de aplicadas no las vuelve a
 * correr nunca.
 *
 * Así que la tabla que agregue alguien el mes que viene tiene que traer lo
 * suyo escrito. Si no:
 *
 *   * sin la clave, borrar un restaurante le deja las filas colgadas — y con
 *     los restaurantes de prueba, que se borran solos cada dos horas, eso es
 *     basura que crece todos los días;
 *   * sin RLS, una consulta a la que se le escape el `WHERE` devuelve filas
 *     de otro restaurante, que es exactamente lo que el aislamiento existe
 *     para impedir.
 *
 * Las excepciones van listadas acá abajo, con su motivo.
 */

/**
 * Las que se leen antes de saber de qué restaurante son.
 *
 * `demos` cuenta los que viven y busca los vencidos: las dos son preguntas
 * sobre todos a la vez. No usa RLS como su defensa —no guarda nada secreto,
 * sólo ids y fechas— y sí lleva su clave a `tenants`, que es lo que hace que
 * borrar el restaurante se lleve también su vencimiento.
 */
const SIN_AISLAMIENTO = new Set(['demos']);

/**
 * Las que a propósito sobreviven al restaurante.
 *
 * `billing_events` es el registro de los avisos del medio de pago. Se escribe
 * desde el webhook ANTES de saber a qué restaurante corresponde —por eso
 * tampoco se aísla, lo dice la 044— así que una clave a `tenants` rechazaría
 * el aviso de un local que todavía no existe o que ya se dio de baja, y
 * perder un aviso de pago es peor que guardar una fila de más. Es, además, el
 * papel de lo que se cobró: no se va con la cuenta que lo generó.
 *
 * A los restaurantes de prueba no los toca: nunca pagan nada.
 */
const SIN_CASCADA = new Set(['billing_events']);

/**
 * Hasta dónde llegaron los barridos de una sola vez.
 *
 * La 018 ató lo que existía hasta ella, y la 037 aisló lo que existía hasta
 * ella. Lo anterior está cubierto por esas dos; lo posterior tiene que
 * traerlo escrito, porque ninguna de las dos vuelve a correr.
 */
const ATADAS_POR_LA_018 = 18;
const AISLADAS_POR_LA_037 = 37;

/** El número que lleva adelante el nombre del archivo. */
function numeroDe(archivo: string): number {
  return Number(archivo.slice(0, 3));
}

interface Tabla {
  readonly nombre: string;
  readonly archivo: string;
  readonly cuerpo: string;
  readonly contenido: string;
}

function tablasConTenant(): readonly Tabla[] {
  const encontradas: Tabla[] = [];

  for (const archivo of readdirSync(CARPETA).filter((nombre) => nombre.endsWith('.sql'))) {
    const contenido = readFileSync(join(CARPETA, archivo), 'utf8').replace(/\r\n/g, '\n');

    // `CREATE TABLE ... ( ... );` — el cuerpo hasta el paréntesis que cierra.
    const crea = /CREATE TABLE (?:IF NOT EXISTS )?(\w+)\s*\(([\s\S]*?)\n\);/g;
    let encontrada: RegExpExecArray | null = crea.exec(contenido);

    while (encontrada !== null) {
      const [, nombre = '', cuerpo = ''] = encontrada;
      if (/\btenant_id\b/.test(cuerpo)) {
        encontradas.push({ nombre, archivo, cuerpo, contenido });
      }
      encontrada = crea.exec(contenido);
    }
  }

  return encontradas;
}

describe('toda tabla con tenant_id', () => {
  const tablas = tablasConTenant();

  it('hay tablas para revisar', () => {
    // Si el buscador se rompe, los demás tests pasarían sin mirar nada.
    expect(tablas.length).toBeGreaterThan(5);
  });

  it.each(tablas.map((tabla) => [tabla.nombre, tabla] as const))(
    '%s se borra con su restaurante',
    (_nombre, tabla) => {
      // La 018 ató las que existían entonces y no vuelve a correr: la que
      // nace después trae su clave escrita o queda huérfana para siempre.
      if (numeroDe(tabla.archivo) <= ATADAS_POR_LA_018) return;
      if (SIN_CASCADA.has(tabla.nombre)) return;
      const atada =
        /REFERENCES\s+tenants\s*\(\s*id\s*\)[^,\n]*ON DELETE CASCADE/i.test(tabla.cuerpo) ||
        new RegExp(`ALTER TABLE ${tabla.nombre}[\\s\\S]*?REFERENCES tenants`, 'i').test(
          tabla.contenido,
        );

      expect(`${tabla.archivo}: ${tabla.nombre} — ${atada ? 'ok' : 'sin cascada'}`).toContain('ok');
    },
  );

  it.each(tablas.map((tabla) => [tabla.nombre, tabla] as const))(
    '%s se aísla por restaurante',
    (_nombre, tabla) => {
      if (SIN_AISLAMIENTO.has(tabla.nombre)) return;
      if (numeroDe(tabla.archivo) <= AISLADAS_POR_LA_037) return;

      // La 037 tampoco vuelve a correr. Vale tanto la política escrita en la
      // propia migración como una que la apague a propósito y diga por qué.
      const aislada =
        new RegExp(`ALTER TABLE ${tabla.nombre} ENABLE ROW LEVEL SECURITY`, 'i').test(
          tabla.contenido,
        ) && new RegExp(`POLICY tenant_isolation ON ${tabla.nombre}`, 'i').test(tabla.contenido);

      expect(`${tabla.archivo}: ${tabla.nombre} — ${aislada ? 'ok' : 'sin RLS'}`).toContain('ok');
    },
  );
});
