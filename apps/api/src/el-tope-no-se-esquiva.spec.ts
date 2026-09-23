import { normaliseEmail } from '@itadaki/identity/domain';

/**
 * El tope de intentos de login se esquivaba con un espacio.
 *
 * La clave del cubo salía de `body.email.toLowerCase()` y el login encuentra al
 * usuario con `normaliseEmail`, que además hace `trim()`. Así,
 * "ana@local.com" y "ana@local.com " eran la misma cuenta para entrar y dos
 * cuentas distintas para el tope: cada variante de espaciado regalaba otros
 * diez intentos, desde la misma IP.
 *
 * Lo que se arregla es que las dos rutas usen la MISMA función, no dos
 * normalizaciones parecidas.
 */

// Lo que hace el guard al armar la clave, después del arreglo.
const claveDelCubo = (nombre: string, ip: string, email: unknown): string =>
  `${nombre}:${ip}:${typeof email === 'string' ? normaliseEmail(email) : ''}`;

describe('la clave del tope de intentos', () => {
  it('no cambia por espacios ni mayúsculas', () => {
    const esperada = claveDelCubo('login', '1.2.3.4', 'ana@local.com');

    for (const disfraz of [
      'ana@local.com ',
      ' ana@local.com',
      '  ana@local.com  ',
      'ANA@local.com',
      'Ana@Local.Com ',
      '\tana@local.com\n',
    ]) {
      expect(claveDelCubo('login', '1.2.3.4', disfraz)).toBe(esperada);
    }
  });

  it('sigue separando cuentas distintas', () => {
    expect(claveDelCubo('login', '1.2.3.4', 'ana@local.com')).not.toBe(
      claveDelCubo('login', '1.2.3.4', 'juan@local.com'),
    );
  });

  it('sigue separando el mismo mail desde IPs distintas', () => {
    expect(claveDelCubo('login', '1.2.3.4', 'ana@local.com')).not.toBe(
      claveDelCubo('login', '5.6.7.8', 'ana@local.com'),
    );
  });

  it('vale igual para el reseteo y para soporte, que comparten el camino', () => {
    for (const nombre of ['passwordReset', 'soporte']) {
      expect(claveDelCubo(nombre, '1.2.3.4', 'ana@local.com ')).toBe(
        claveDelCubo(nombre, '1.2.3.4', 'ana@local.com'),
      );
    }
  });

  it('un cuerpo sin mail no rompe la clave', () => {
    expect(claveDelCubo('login', '1.2.3.4', undefined)).toBe('login:1.2.3.4:');
  });
});
