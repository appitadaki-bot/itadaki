import { ROLES, can, entraConMail, entraConPin, permissionsOf } from './role';

/**
 * Cada rol entra por una sola puerta.
 *
 * Tener las dos abiertas confundía: al mozo el alta le daba usuario y PIN, y
 * la pantalla igual le ofrecía entrar con mail y contraseña — una contraseña
 * que nadie le dictó, y un mail que muchas veces es inventado
 * (`@sin-mail.itadaki`).
 */
describe('con qué entra cada rol', () => {
  it('el mozo y la cocina, con usuario y PIN', () => {
    expect(entraConPin('WAITER')).toBe(true);
    expect(entraConPin('KITCHEN')).toBe(true);
  });

  it('el dueño y el encargado, con mail y contraseña', () => {
    expect(entraConMail('OWNER')).toBe(true);
    expect(entraConMail('MANAGER')).toBe(true);
  });

  /** Son excluyentes: ningún rol entra por las dos, ni por ninguna. */
  it('cada rol tiene exactamente una puerta', () => {
    for (const role of ROLES) {
      expect(entraConPin(role)).toBe(!entraConMail(role));
    }
  });

  /**
   * El dueño no puede quedar sin entrar con mail.
   *
   * Es quien paga, quien recibe la factura y el único que recupera el acceso
   * por su cuenta. Un PIN dictado en el salón no protege eso, y si además
   * fuera su única puerta, perderlo dejaría al restaurante sin dueño.
   */
  it('el dueño siempre entra con mail', () => {
    expect(entraConMail('OWNER')).toBe(true);
    expect(entraConPin('OWNER')).toBe(false);
  });
});

describe('los permisos de cada rol', () => {
  it('sólo el dueño maneja el personal', () => {
    expect(can('OWNER', 'staff:manage')).toBe(true);
    expect(can('MANAGER', 'staff:manage')).toBe(false);
    expect(can('WAITER', 'staff:manage')).toBe(false);
    expect(can('KITCHEN', 'staff:manage')).toBe(false);
  });

  it('la cocina no toca la plata', () => {
    expect(can('KITCHEN', 'bills:close')).toBe(false);
    expect(can('KITCHEN', 'metrics:read')).toBe(false);
  });

  it('el mozo cobra pero no edita la carta', () => {
    expect(can('WAITER', 'bills:close')).toBe(true);
    expect(can('WAITER', 'menu:write')).toBe(false);
  });

  it('todos pueden leer la carta', () => {
    for (const role of ROLES) {
      expect(permissionsOf(role)).toContain('menu:read');
    }
  });
});
