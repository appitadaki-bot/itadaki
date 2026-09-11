import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Category } from '@itadaki/catalog/domain';
import { InMemoryCategoryStore } from './in-memory-catalog';

const categoria = (id: string, tenantId = 'don-pepe'): Category =>
  ({ id, tenantId, name: id, sortOrder: 1 }) as Category;

/**
 * Borrar una categoría que tiene platos, pasándolos a otra.
 *
 * Antes se negaba mientras tuviera platos, y había que pasarlos de a uno a
 * otra categoría para poder borrarla. La × aparecía apagada, con la
 * explicación en un `title` que en el celular no existe.
 */
describe('borrar una categoría moviendo sus platos', () => {
  it('se borra si el destino existe', async () => {
    const store = new InMemoryCategoryStore([categoria('bebidas'), categoria('entradas')]);

    const hecho = await store.remove('don-pepe', 'bebidas', 'entradas');

    expect(hecho.isOk()).toBe(true);
    const quedan = await store.list('don-pepe');
    expect(quedan.isOk() && quedan.value.map((c) => c.id)).toEqual(['entradas']);
  });

  it('no mueve a la misma categoría que se está borrando', async () => {
    const store = new InMemoryCategoryStore([categoria('bebidas')]);

    const hecho = await store.remove('don-pepe', 'bebidas', 'bebidas');

    expect(hecho.isErr()).toBe(true);
  });

  it('no mueve a una categoría que no existe, y no borra nada', async () => {
    const store = new InMemoryCategoryStore([categoria('bebidas')]);

    const hecho = await store.remove('don-pepe', 'bebidas', 'fantasma');

    expect(hecho.isErr() && hecho.error.kind).toBe('NOT_FOUND');
    const quedan = await store.list('don-pepe');
    expect(quedan.isOk() && quedan.value).toHaveLength(1);
  });

  it('no mueve a la categoría de otro restaurante', async () => {
    const store = new InMemoryCategoryStore([
      categoria('bebidas'),
      categoria('entradas', 'otro-local'),
    ]);

    const hecho = await store.remove('don-pepe', 'bebidas', 'entradas');

    expect(hecho.isErr()).toBe(true);
  });
});

/**
 * En Postgres, el orden importa: validar el destino, mover, y recién ahí
 * borrar. Al revés, un destino inválido dejaría los platos movidos a ningún
 * lado o la categoría borrada con platos adentro.
 */
describe('el orden en la base', () => {
  const FUENTE = readFileSync(join(__dirname, 'postgres-catalog.ts'), 'utf-8').replace(
    /\r\n/g,
    '\n',
  );
  const borrar = FUENTE.slice(FUENTE.indexOf('async remove(\n    tenantId: string,\n    categoryId'));

  it('valida el destino antes de mover', () => {
    const valida = borrar.indexOf('SELECT 1 FROM categories WHERE id = $1');
    const mueve = borrar.indexOf('UPDATE products SET category_id');
    expect(valida).toBeGreaterThan(-1);
    expect(valida).toBeLessThan(mueve);
  });

  it('mueve antes de borrar', () => {
    const mueve = borrar.indexOf('UPDATE products SET category_id');
    const borra = borrar.indexOf('DELETE FROM categories');
    expect(mueve).toBeLessThan(borra);
  });

  it('todo dentro de la misma transacción', () => {
    const transaccion = borrar.indexOf('this.db.withTenant(');
    expect(transaccion).toBeGreaterThan(-1);
    expect(transaccion).toBeLessThan(borrar.indexOf('UPDATE products SET category_id'));
  });
});
