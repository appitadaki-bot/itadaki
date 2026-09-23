import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROLES, can } from '@itadaki/identity/domain';

/**
 * Cobrar es de la caja, no del mozo.
 *
 * El mozo tenía `bills:close`, que es cobrar una mesa y también liberarla sin
 * cobrarla. Con eso cualquiera del salón podía, a las tres de la mañana y
 * desde su teléfono, marcar mesas como pagadas o hacerlas desaparecer. Y como
 * nada guardaba quién había cerrado la mesa, al otro día no se podía
 * reconstruir.
 */
describe('quién puede cerrar la plata', () => {
  it('la caja sí', () => {
    expect(can('CAJA', 'bills:close')).toBe(true);
  });

  it('el mozo no', () => {
    expect(can('WAITER', 'bills:close')).toBe(false);
  });

  it('pero el mozo sigue atendiendo y viendo lo que se debe', () => {
    // Si no, no sabría que la mesa sigue abierta.
    for (const permiso of ['orders:read', 'orders:advance', 'bills:read'] as const) {
      expect(can('WAITER', permiso)).toBe(true);
    }
  });

  it('la caja no ve las ventas ni toca la carta', () => {
    // Cuánto vende el local es del dueño.
    expect(can('CAJA', 'metrics:read')).toBe(false);
    expect(can('CAJA', 'menu:write')).toBe(false);
    expect(can('CAJA', 'staff:manage')).toBe(false);
  });

  it('el rol existe en la lista', () => {
    expect(ROLES).toContain('CAJA');
  });
});

const SESIONES = readFileSync(join(__dirname, 'sessions.controller.ts'), 'utf-8').replace(
  /\r\n/g,
  '\n',
);
const CUENTAS = readFileSync(join(__dirname, 'bills.controller.ts'), 'utf-8').replace(/\r\n/g, '\n');
const SALON = readFileSync(
  join(__dirname, '..', '..', 'floor-web', 'src', 'app', 'floor.component.ts'),
  'utf-8',
).replace(/\r\n/g, '\n');

describe('la otra puerta a la plata', () => {
  it('liberar sin cobrar pide el mismo permiso que cobrar', () => {
    // Hace desaparecer una mesa sin registrar un peso: bloquear sólo "cobré"
    // dejaba ésta abierta.
    const release = SESIONES.slice(0, SESIONES.indexOf("@Post(':id/release')"));
    expect(release.slice(-120)).toContain("@RequirePermission('bills:close')");
  });

  it('el salón no le muestra al mozo botones que no puede usar', () => {
    expect(SALON).toContain("auth.can('bills:close')");
  });
});

describe('queda registrado quién cerró la mesa', () => {
  it('al cobrar', () => {
    expect(CUENTAS).toContain("queHizo: 'COBRO'");
    expect(CUENTAS).toContain('quien.userId');
  });

  it('y al liberar sin cobrar', () => {
    expect(SESIONES).toContain("queHizo: 'LIBERO'");
  });

  it('el registro no puede voltear el cobro', () => {
    // La mesa ya está cobrada y el cliente parado ahí: un fallo del registro
    // va al log, no a la cara del cajero.
    expect(CUENTAS).toContain('void this.bills.cierres?.registrar(');
  });

  it('guarda el nombre y no sólo el id', () => {
    // Tiene que seguir diciendo quién fue aunque esa persona ya no trabaje acá.
    expect(CUENTAS).toContain('nombre: quien.displayName');
  });
});
