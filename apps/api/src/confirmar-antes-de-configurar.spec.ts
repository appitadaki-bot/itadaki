import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Que confirmar el mail sea obligatorio para configurar, y para nada más.
 *
 * La verificación existía pero no gateaba nada: alguien se anotaba con un
 * mail mal tipeado —o con el de otro— y operaba un restaurante igual.
 *
 * Lo que no puede pasar es lo contrario: que un correo que no llegó deje a
 * un local sin tomar pedidos. Por eso el corte está en la configuración y se
 * verifica acá, donde se nota si alguien lo mueve.
 */
const AUTH = readFileSync(join(__dirname, 'auth.ts'), 'utf-8');
const CONTROLLER = readFileSync(join(__dirname, 'auth.controller.ts'), 'utf-8');

describe('confirmar el mail antes de configurar', () => {
  it('el guard lo exige', () => {
    expect(AUTH).toContain('puedeSinConfirmar(needed');
    expect(AUTH).toContain('MAIL_SIN_CONFIRMAR');
  });

  /**
   * Después del permiso, no antes: a quien no puede hacer algo hay que
   * decirle que no puede, y no pedirle que confirme un mail que igual no lo
   * habilitaría.
   */
  it('y lo pregunta después del permiso', () => {
    const permiso = AUTH.indexOf("kind: 'FORBIDDEN'");
    const confirma = AUTH.indexOf('puedeSinConfirmar(needed');
    expect(permiso).toBeGreaterThan(-1);
    expect(confirma).toBeGreaterThan(permiso);
  });

  /** Confirmar tiene que valer en el acto, no cuando venza la caché. */
  it('verificar borra el estado cacheado', () => {
    expect(CONTROLLER).toContain('olvidarMailConfirmado(');
  });

  /**
   * Un fallo de base no puede bloquear el panel de un local que hizo todo
   * bien: no poder averiguarlo no es lo mismo que saber que no confirmó.
   */
  it('ante un fallo de lectura, deja pasar', () => {
    const store = readFileSync(
      join(process.cwd(), 'libs/identity/infra/src/lib/postgres-staff.ts'),
      'utf-8',
    );
    const donde = store.indexOf('async mailConfirmado');
    const cuerpo = store.slice(donde, donde + 900);
    expect(cuerpo).toContain('catch');
    expect(cuerpo.slice(cuerpo.indexOf('catch'))).toContain('return true');
  });
});
