import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tenantDelToken } from './tenant-del-token';

/** Un token como los que firma el servidor: cuerpo en base64url, punto, firma. */
const tokenCon = (cuerpo: unknown): string => {
  const base64 = btoa(JSON.stringify(cuerpo))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
  return `${base64}.firmafalsa`;
};

/**
 * De qué restaurante es la mesa.
 *
 * Estaba escrito fijo en el arranque —el restaurante demo— y la carta pública
 * salía siempre de ahí: el comensal de un local veía los platos de otro.
 */
describe('el restaurante que dice el QR', () => {
  it('lo saca del cuerpo del token', () => {
    expect(tenantDelToken(tokenCon({ tenantId: 'taco-sabrosito', tableId: 'mesa-1' }))).toBe(
      'taco-sabrosito',
    );
  });

  it('entiende el base64url, que es como viaja en la URL', () => {
    // Un id largo obliga a los caracteres - y _ que base64 normal no tiene.
    const largo = 'restaurante-con-nombre-larguisimo-01234';
    expect(tenantDelToken(tokenCon({ tenantId: largo, tableId: 'mesa-1' }))).toBe(largo);
  });

  it('sin token no dice nada, en vez de inventar uno', () => {
    expect(tenantDelToken(null)).toBeNull();
    expect(tenantDelToken('')).toBeNull();
  });

  it('un token roto tampoco', () => {
    expect(tenantDelToken('esto-no-es-un-token')).toBeNull();
    expect(tenantDelToken('.firma')).toBeNull();
  });

  it('y uno sin restaurante adentro, menos', () => {
    expect(tenantDelToken(tokenCon({ tableId: 'mesa-1' }))).toBeNull();
    expect(tenantDelToken(tokenCon({ tenantId: '', tableId: 'mesa-1' }))).toBeNull();
    expect(tenantDelToken(tokenCon({ tenantId: 42, tableId: 'mesa-1' }))).toBeNull();
  });
});

/**
 * El servidor y el cliente tienen que estar de acuerdo en qué restaurante es.
 *
 * La carta pública se pedía sin nada que dijera de qué local era la mesa, así
 * que el servidor caía siempre en el restaurante por defecto.
 */
describe('el token viaja con el pedido de la carta', () => {
  const CATALOGO = readFileSync(join(__dirname, 'http-catalog.ts'), 'utf-8').replace(/\r\n/g, '\n');
  const API = readFileSync(join(__dirname, '..', '..', '..', 'api', 'src', 'auth.ts'), 'utf-8');

  it('el cliente lo manda en el encabezado', () => {
    expect(CATALOGO).toContain("'X-Table-Token': token");
  });

  it('y el servidor lo lee antes de caer en el restaurante por defecto', () => {
    const donde = API.indexOf('DEFAULT_TENANT;');
    expect(API.slice(0, donde)).toContain("request.headers['x-table-token']");
  });

  it('la carta guardada sin señal es la de ese restaurante', () => {
    // Un teléfono que estuvo en dos locales mostraba la del anterior.
    expect(CATALOGO).toContain('cacheMenu(this.menu, deQuien)');
    expect(CATALOGO).toContain('cachedMenu<MenuDto>(deQuien)');
  });
});
