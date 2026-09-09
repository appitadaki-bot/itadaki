import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { comoTratarLoSinAislar, type TablaSinAislar } from './aislamiento-activo';

const sinAislar = (tabla: string, cambios: Partial<TablaSinAislar> = {}): TablaSinAislar => ({
  tabla,
  activo: false,
  forzado: false,
  ...cambios,
});

/**
 * El panel de un restaurante recién creado mostraba los mozos de otro.
 *
 * Las consultas de cada local no llevan `WHERE tenant_id`: filtra la política
 * de row level security. Cuando falta no falla nada — devuelve de más, y todo
 * lo demás parece andar bien.
 */
describe('el aislamiento entre restaurantes', () => {
  it('con todo aislado no dice nada', () => {
    expect(comoTratarLoSinAislar([], 'production')).toBeNull();
  });

  it('en un servidor, rompe el arranque', () => {
    // Seguir sirviendo la versión anterior es mejor que atender con los datos
    // de todos mezclados.
    const queHacer = comoTratarLoSinAislar([sinAislar('staff_users')], 'production');

    expect(queHacer?.rompe).toBe(true);
    expect(queHacer?.mensaje).toContain('staff_users');
  });

  it('en desarrollo avisa y sigue', () => {
    // Quien prueba con un solo restaurante no tiene por qué quedarse sin API.
    expect(comoTratarLoSinAislar([sinAislar('staff_users')], undefined)?.rompe).toBe(false);
  });

  it('nombra todas las tablas, no sólo la primera', () => {
    const queHacer = comoTratarLoSinAislar(
      [sinAislar('staff_users'), sinAislar('orders'), sinAislar('products')],
      'production',
    );

    for (const tabla of ['staff_users', 'orders', 'products']) {
      expect(queHacer?.mensaje).toContain(tabla);
    }
  });

  it('dice qué hacer, no sólo qué pasa', () => {
    expect(comoTratarLoSinAislar([sinAislar('orders')], 'production')?.mensaje).toContain(
      'db:migrate',
    );
  });
});

/**
 * `ENABLE` sin `FORCE` no alcanza: el dueño de la tabla sigue viendo todas las
 * filas, y la API se conecta con un rol que en Neon y en Render es el dueño.
 */
describe('la consulta que busca las tablas sin aislar', () => {
  const FUENTE = readFileSync(join(__dirname, 'aislamiento-activo.ts'), 'utf-8').replace(
    /\r\n/g,
    '\n',
  );

  it('exige las dos cosas, no sólo que el RLS esté activo', () => {
    expect(FUENTE).toContain('c.relrowsecurity IS NOT TRUE OR c.relforcerowsecurity IS NOT TRUE');
  });

  it('mira sólo las tablas que son de un restaurante', () => {
    // `tenants` no tiene `tenant_id`: dice qué restaurantes existen y se lee
    // antes de saber de cuál se trata.
    expect(FUENTE).toContain("col.column_name = 'tenant_id'");
  });
});

/** La migración tiene que arreglar exactamente lo que el arranque verifica. */
describe('la migración que lo vuelve a poner', () => {
  const MIGRACION = readFileSync(
    join(
      __dirname,
      '..', '..', '..',
      'libs', 'shared', 'persistence', 'src', 'lib', 'migrations',
      '037_aislar_de_verdad.sql',
    ),
    'utf-8',
  ).replace(/\r\n/g, '\n');

  it('activa y fuerza, no sólo activa', () => {
    expect(MIGRACION).toContain('ENABLE ROW LEVEL SECURITY');
    expect(MIGRACION).toContain('FORCE ROW LEVEL SECURITY');
  });

  it('rehace la política en vez de dejarla si ya estaba', () => {
    // Una política vieja con otra condición es tan mala como no tener ninguna.
    expect(MIGRACION).toContain('DROP POLICY IF EXISTS tenant_isolation');
    expect(MIGRACION).toContain('CREATE POLICY tenant_isolation');
  });

  it('recorre las tablas en vez de nombrarlas a mano', () => {
    // Así cubre también las que se agreguen después de escribir esto.
    expect(MIGRACION).toContain("col.column_name = 'tenant_id'");
  });
});
