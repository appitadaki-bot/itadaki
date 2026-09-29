import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A dónde apunta el link que viaja por mail.
 *
 * `ADMIN_APP_URL` no estaba declarada en el blueprint, así que caía en
 * `http://localhost:4400` — la máquina de quien recibe el correo, no el
 * panel. El mail llegaba, se tocaba el botón, y no abría nada. Quien se quedó
 * afuera de su restaurante no tenía cómo volver a entrar, y del lado del
 * servidor todo parecía haber funcionado: el correo salió.
 *
 * Es el mismo modo de fallar que tenía el mailer sin su clave, y se trata
 * igual: el arranque se cae antes de mandar links muertos.
 */

const AUTH = readFileSync(join(__dirname, 'auth.ts'), 'utf-8').replace(/\r\n/g, '\n');
const BLUEPRINT = readFileSync(join(__dirname, '..', '..', '..', 'render.yaml'), 'utf-8').replace(
  /\r\n/g,
  '\n',
);

describe('el panel donde abren los links del mail', () => {
  it('está declarado en el blueprint', () => {
    expect(BLUEPRINT).toContain('key: ADMIN_APP_URL');
  });

  it('y con las otras URLs que el despliegue tiene que definir', () => {
    // Si vive lejos de DINER_APP_URL es más fácil que la próxima se olvide.
    const diner = BLUEPRINT.indexOf('key: DINER_APP_URL');
    const admin = BLUEPRINT.indexOf('key: ADMIN_APP_URL');

    expect(diner).toBeGreaterThan(-1);
    expect(Math.abs(admin - diner)).toBeLessThan(700);
  });

  it('en un servidor, sin ella el arranque se cae', () => {
    expect(AUTH).toContain('ADMIN_APP_URL es obligatoria en producción');
  });

  it('y lo decide como el mailer, no sólo por NODE_ENV', () => {
    // NODE_ENV no estaba declarada en el blueprint cuando esto se escribió:
    // mirar sólo esa variable ya dejó pasar un fallo igual una vez.
    const guarda = AUTH.slice(AUTH.indexOf('function panelParaLosMails'));
    const cuerpo = guarda.slice(0, guarda.indexOf('\n}'));

    expect(cuerpo).toContain("process.env['NODE_ENV'] === 'production'");
    expect(cuerpo).toContain('DATABASE_URL');
  });

  it('en local sigue andando sin declararla', () => {
    // Quien levanta el proyecto por primera vez no tiene que configurar nada.
    expect(AUTH).toContain("urlFromEnv('ADMIN_APP_URL', 'http://localhost:4400')");
  });
});
