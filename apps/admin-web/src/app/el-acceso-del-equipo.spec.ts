import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Cómo se le entrega el acceso a alguien del equipo.
 *
 * Tres cosas que se rompían juntas.
 *
 * Los datos aparecían al pie de la lista de personal: con un equipo de seis
 * quedaban abajo de todo, el dueño cerraba la pantalla y el PIN se perdía —
 * porque se muestra una sola vez y después queda cifrado.
 *
 * El link salía siempre del panel, así que a un mozo se le daba la dirección
 * del admin, donde su usuario no entra.
 *
 * Y el salón y la cocina pedían mail y contraseña, que el personal no tiene.
 */

const PANEL = readFileSync(join(__dirname, 'admin.component.ts'), 'utf-8').replace(/\r\n/g, "\n");
const LOGIN = readFileSync(
  join(__dirname, '../../../../libs/shared/ui-auth/src/lib/login.component.ts'),
  'utf-8',
);

/** Lo mismo que decide el panel. */
function appDe(role: string, origen: string): string {
  const sub: Record<string, string> = {
    KITCHEN: 'cocina',
    WAITER: 'salon',
    MANAGER: 'admin',
    OWNER: 'admin',
  };
  const cual = sub[role] ?? 'admin';
  return origen.includes('admin.') ? origen.replace('admin.', `${cual}.`) : origen;
}

describe('el link lleva a la app donde trabaja cada uno', () => {
  const origen = 'https://admin.itadaki.app';

  it('el mozo va al salón', () => {
    expect(appDe('WAITER', origen)).toBe('https://salon.itadaki.app');
  });

  it('la cocina va a la cocina', () => {
    expect(appDe('KITCHEN', origen)).toBe('https://cocina.itadaki.app');
  });

  it('el encargado va al panel', () => {
    // Es quien administra: su lugar de trabajo es el panel.
    expect(appDe('MANAGER', origen)).toBe('https://admin.itadaki.app');
  });

  it('un puesto que no conocemos va al panel', () => {
    // Mejor un link que no sirve del todo que uno a un subdominio inventado.
    expect(appDe('ALGO_NUEVO', origen)).toBe('https://admin.itadaki.app');
  });

  it('en localhost no inventa subdominios', () => {
    // Cada app tiene su puerto, no su subdominio.
    expect(appDe('WAITER', 'http://localhost:4400')).toBe('http://localhost:4400');
  });
});

describe('los datos de acceso se ven', () => {
  it('son una ventana y no un cartel al pie', () => {
    // El PIN se ve una sola vez: si el dueño no lo ve, se perdió.
    expect(PANEL).toMatch(/@if \(pinNuevo\(\); as datos\) \{\s*\n\s*<div class="modal"/);
  });

  it('no se cierra sola', () => {
    // Lo único que hay que hacer en ese momento es copiarlo y mandárselo.
    expect(PANEL).toContain('(click)="pinNuevo.set(null)"');
  });

  it('el link es el del puesto de esa persona', () => {
    expect(PANEL).toContain('linkPara(datos.role)');
  });
});

describe('el personal entra con usuario y PIN', () => {
  it('en las apps donde no se registra un restaurante', () => {
    // El salón y la cocina son del equipo: pedirles mail y contraseña los
    // dejaba trabados en un formulario que no pueden completar.
    expect(LOGIN).toContain('if (!this.allowSignUp())');
  });

  it('sin depender de que el link traiga el local', () => {
    // El usuario es único en toda la base: identifica a la persona sin el
    // restaurante, y si trabaja en varios elige después de poner el PIN.
    const bloque = LOGIN.slice(LOGIN.indexOf('if (!this.allowSignUp())'));
    expect(bloque.slice(0, 120)).toContain('this.conPin.set(true)');
  });

  it('y el dueño puede entrar con su mail igual', () => {
    // Entra al salón a ver cómo viene la noche: es su restaurante.
    expect(LOGIN).toContain('Entrar con mail y contraseña');
  });
});
