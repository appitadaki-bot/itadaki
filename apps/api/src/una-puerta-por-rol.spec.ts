import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Cada rol entra por una sola puerta.
 *
 * Al mozo el alta le daba usuario y PIN, y la pantalla igual le ofrecía
 * "entrar con mail y contraseña": una contraseña que nadie le dictó, para un
 * mail que muchas veces es inventado (`@sin-mail.itadaki`). Quedaba probando
 * algo que no podía funcionar.
 *
 * El bloqueo real está en el servidor y no sólo en la pantalla: esconder el
 * enlace deja el endpoint abierto para cualquiera que lo llame de frente.
 */
const AUTH = readFileSync(join(__dirname, 'auth.controller.ts'), 'utf-8');
const LOGIN = readFileSync(
  join(
    process.cwd(),
    'libs/shared/ui-auth/src/lib/login.component.ts',
  ),
  'utf-8',
);

describe('una puerta por rol', () => {
  it('el servidor rechaza el login con mail de un rol que usa PIN', () => {
    expect(AUTH).toContain('entraConMail(found.value.role)');
  });

  /**
   * Después de verificar la contraseña, no antes.
   *
   * Al revés, responder distinto antes de comprobarla diría qué mails existen
   * y con qué rol — justo lo que el resto del endpoint cuida.
   */
  it('y lo rechaza recién después de verificar la contraseña', () => {
    const verifica = AUTH.indexOf('const matches = await verifyPassword');
    const rechaza = AUTH.indexOf('entraConMail(found.value.role)');

    expect(verifica).toBeGreaterThan(-1);
    expect(rechaza).toBeGreaterThan(verifica);
  });

  /** Contestar distinto confirmaría que ese mail tiene cuenta. */
  it('y contesta lo mismo que un dato equivocado', () => {
    const donde = AUTH.indexOf('entraConMail(found.value.role)');
    expect(AUTH.slice(donde, donde + 400)).toContain("kind: 'INVALID_CREDENTIALS'");
  });

  it('la pantalla del personal no ofrece el mail', () => {
    const donde = LOGIN.indexOf('Entrar con mail y contraseña');
    expect(donde).toBeGreaterThan(-1);
    // Envuelto en `entraConMail`, que es lo que distingue el panel del dueño
    // de las apps del salón y la cocina.
    expect(LOGIN.slice(donde - 300, donde)).toContain('@if (entraConMail())');
  });

  /**
   * En el panel se conserva: ahí el PIN se enciende por el tramo de la URL, y
   * el dueño tiene que poder volver a su mail.
   */
  it('pero el panel del dueño sí', () => {
    const salon = readFileSync(
      join(process.cwd(), 'apps/floor-web/src/app/floor.component.ts'),
      'utf-8',
    );
    const admin = readFileSync(
      join(process.cwd(), 'apps/admin-web/src/app/admin.component.ts'),
      'utf-8',
    );

    expect(salon).toContain('[entraConMail]="false"');
    // El panel no lo apaga: usa el valor por defecto, que es true.
    expect(admin).not.toContain('[entraConMail]="false"');
  });
});

/**
 * Que el salón y la cocina pidan usuario y PIN, no mail.
 *
 * La lógica existía pero corría en el constructor, donde `entraConMail()`
 * todavía devuelve su valor por defecto —`true`— porque los inputs del
 * template llegan después. El resultado era una pantalla pidiendo mail y
 * contraseña: justo lo que el mozo y el cocinero no tienen.
 */
describe('el modo PIN se enciende cuando corresponde', () => {
  const LOGIN_TS = readFileSync(
    join(process.cwd(), 'libs/shared/ui-auth/src/lib/login.component.ts'),
    'utf-8',
  );

  it('se decide en un effect y no en el constructor', () => {
    const donde = LOGIN_TS.indexOf('this.conPin.set(true)');
    expect(donde).toBeGreaterThan(-1);

    // El `effect` tiene que envolverlo: leerlo suelto es leer el default.
    const antes = LOGIN_TS.slice(Math.max(0, donde - 400), donde);
    expect(antes).toContain('effect(()');
  });
});
