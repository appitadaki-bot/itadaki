/**
 * Qué migraciones faltan aplicar.
 *
 * Vive aparte del código que habla con la base para poder probarse: la
 * decisión —qué corre y qué no— es lo que importa, y no necesita Postgres.
 */

export interface MigracionAplicada {
  readonly name: string;
  readonly checksum: string;
}

/**
 * Las que todavía no se aplicaron, en orden de nombre.
 *
 * Un archivo aplicado no vuelve a correr nunca. Eso es todo el cambio, y es lo
 * que evita que una migración de agosto le imponga su forma a datos de
 * octubre: nos pasó tres veces —una restricción de pagos que rechazaba un
 * valor que ella misma autorizó después, una función cuyo tipo de retorno
 * cambió, y un UPDATE que marcaba verificadas cuentas que esperaban su mail—
 * y las tres veces el síntoma no se parecía en nada a la causa.
 */
export function pendientes(
  archivos: readonly string[],
  aplicadas: readonly MigracionAplicada[],
): readonly string[] {
  const ya = new Set(aplicadas.map((una) => una.name));
  return archivos.filter((archivo) => !ya.has(archivo));
}

/**
 * Las que cambiaron después de haberse aplicado.
 *
 * No se vuelven a correr —eso es justamente lo que este registro evita— así
 * que editar un archivo ya aplicado no hace nada, en silencio. Decirlo es lo
 * único que separa "no hace falta" de "creí que lo estaba cambiando".
 *
 * No es un error: durante meses editar migraciones viejas fue la forma de
 * arreglarlas, y varias de esas ediciones son correcciones legítimas que ya
 * corrieron. Lo que hace falta es que se note.
 */
export function modificadas(
  archivos: ReadonlyMap<string, string>,
  aplicadas: readonly MigracionAplicada[],
): readonly string[] {
  return aplicadas
    .filter((una) => {
      const actual = archivos.get(una.name);
      return actual !== undefined && actual !== una.checksum;
    })
    .map((una) => una.name);
}
