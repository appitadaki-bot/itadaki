import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Los restaurantes los damos de alta nosotros.
 *
 * Había dos formas de crearse una cuenta solo: `POST /auth/signup`, y entrar
 * con Google con un mail nuevo, que daba de alta el restaurante. Una cuenta
 * creada así arrancaba vacía justo cuando le habíamos prometido la carta y las
 * mesas cargadas. Y esconder el link del panel no alcanzaba: cualquiera podía
 * llamar al endpoint directo.
 */
const AUTH = readFileSync(join(__dirname, 'auth.controller.ts'), 'utf-8').replace(/\r\n/g, '\n');
const LOGIN = readFileSync(
  join(__dirname, '..', '..', '..', 'libs', 'shared', 'ui-auth', 'src', 'lib', 'login.component.ts'),
  'utf-8',
).replace(/\r\n/g, '\n');
const PAQUETE = readFileSync(join(__dirname, '..', '..', '..', 'package.json'), 'utf-8');

describe('sin alta desde afuera', () => {
  it('no existe el endpoint de alta', () => {
    expect(AUTH).not.toContain("@Post('signup')");
  });

  it('entrar con Google con un mail sin cuenta no crea nada', () => {
    const google = AUTH.slice(AUTH.indexOf("@Post('google')"));
    const cuerpo = google.slice(0, google.indexOf('/** One place that mints a session'));

    expect(cuerpo).toContain("{ kind: 'SIN_CUENTA' }");
    expect(cuerpo).not.toContain('store.signUp(');
  });

  it('el panel no ofrece registrarse', () => {
    expect(LOGIN).not.toContain('Registrá tu restaurante');
    expect(LOGIN).not.toContain('auth.signUp(');
  });

  it('y el alta tiene un camino propio, para el equipo', () => {
    expect(PAQUETE).toContain('"alta:restaurante"');
  });
});
