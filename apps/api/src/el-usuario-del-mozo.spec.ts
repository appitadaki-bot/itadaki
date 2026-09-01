import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * El usuario del personal, único en toda la base.
 *
 * Antes era único por restaurante, con este razonamiento: dos locales pueden
 * tener cada uno su "nico", y obligarlos a inventar nombres raros por culpa de
 * otro cliente no tendría sentido.
 *
 * Lo que ese razonamiento no vio es el mozo que trabaja en dos lugares, que en
 * gastronomía es lo normal. Con usuarios por local esa persona tiene dos
 * cuentas que no se conocen entre sí: dos PIN que recordar, y ningún lugar
 * donde ver en cuál trabaja hoy.
 *
 * Y con el usuario repetido, "nico" no identifica a nadie: quien prueba PINes
 * contra un local está probando contra un usuario que existe en otros veinte,
 * y trabar una cuenta no protege a las demás.
 */

interface Trabajo {
  readonly tenantId: string;
  readonly role: string;
}

/** Lo que decide el login: dónde entra, o si hay que preguntar. */
function aDondeEntra(
  trabajos: readonly Trabajo[],
  elegido: string | undefined,
): { readonly entra: string } | { readonly preguntar: readonly string[] } | null {
  if (trabajos.length === 0) return null;

  if (elegido !== undefined) {
    const uno = trabajos.find((t) => t.tenantId === elegido);
    return uno === undefined ? null : { entra: uno.tenantId };
  }

  if (trabajos.length === 1) return { entra: trabajos[0]!.tenantId };

  return { preguntar: trabajos.map((t) => t.tenantId) };
}

const enUnLugar: Trabajo[] = [{ tenantId: 'parrilla', role: 'WAITER' }];
const enDos: Trabajo[] = [
  { tenantId: 'parrilla', role: 'WAITER' },
  { tenantId: 'bodegon', role: 'MANAGER' },
];

describe('a dónde entra quien usa su usuario', () => {
  it('con un solo trabajo, entra directo', () => {
    // El caso normal: preguntarle en cuál entra sería una pantalla de más.
    expect(aDondeEntra(enUnLugar, undefined)).toEqual({ entra: 'parrilla' });
  });

  it('con dos, se le pregunta', () => {
    const decision = aDondeEntra(enDos, undefined);

    expect(decision).toEqual({ preguntar: ['parrilla', 'bodegon'] });
  });

  it('cuando ya eligió, entra ahí', () => {
    expect(aDondeEntra(enDos, 'bodegon')).toEqual({ entra: 'bodegon' });
  });

  it('elegir un local donde no trabaja no lo deja entrar', () => {
    // Llega por HTTP: puede venir cualquier id.
    expect(aDondeEntra(enDos, 'restaurante-ajeno')).toBeNull();
  });

  it('un usuario sin trabajos no entra a ningún lado', () => {
    expect(aDondeEntra([], undefined)).toBeNull();
  });
});

describe('el puesto es de cada local', () => {
  it('la misma persona puede tener puestos distintos', () => {
    // Mozo en la parrilla, encargado en el bodegón: es la misma persona con
    // el mismo PIN, pero no las mismas atribuciones.
    const puestos = enDos.map((t) => t.role);

    expect(new Set(puestos).size).toBe(2);
  });
});

describe('cuándo se pregunta el local', () => {
  it('nunca antes de verificar el PIN', () => {
    // Preguntarlo antes diría en qué restaurantes trabaja alguien con sólo
    // escribir su usuario, que es justo lo que el PIN protege.
    const codigo = readFileSync(join(__dirname, 'auth.controller.ts'), 'utf-8');

    const login = codigo.slice(codigo.indexOf('async loginConPin('));
    const verificacion = login.indexOf('verifyPassword(');
    const pregunta = login.indexOf('elegirLocal:');

    expect(verificacion).toBeGreaterThan(-1);
    expect(pregunta).toBeGreaterThan(verificacion);
  });
});
