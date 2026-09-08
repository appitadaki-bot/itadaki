import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Que el panel pueda distinguir al que se dio de baja del que dejó de pagar.
 *
 * Los dos llegan como `SUSPENDED`, así que sin `seDioDeBaja` en la respuesta
 * son indistinguibles y el cartel tendría que hablarle a los dos con las
 * mismas palabras — "dimos de baja tu cuenta" a alguien que la dio de baja él.
 *
 * El endpoint arma la respuesta campo por campo, así que agregar algo al
 * dominio no alcanza: hay que acordarse de pasarlo. Este test es ese
 * recordatorio.
 */
const AUTH = readFileSync(join(__dirname, 'auth.controller.ts'), 'utf-8');
const ADMIN = readFileSync(
  join(__dirname, '..', '..', 'admin-web', 'src', 'app', 'admin.component.ts'),
  'utf-8',
);

describe('poder volver a suscribirse', () => {
  it('la API dice si el local se dio de baja', () => {
    expect(AUTH).toContain('seDioDeBaja: described.seDioDeBaja');
  });

  /** Un fallo de lectura no puede ofrecerle volver a quien nunca se fue. */
  it('y ante un fallo de lectura dice que no', () => {
    const fallback = AUTH.indexOf("status: 'ACTIVE', trialEndsAt: null");
    expect(AUTH.slice(fallback, fallback + 120)).toContain('seDioDeBaja: false');
  });

  /*
   * El botón vive donde alcanza con cancelar la baja: mientras le queden días.
   *
   * Reactivar sólo borra `cancelled_at`. Con los días ya vencidos el estado se
   * recalcula igual y la cuenta sigue suspendida: el dueño lo tocaba, no
   * pasaba nada, y lo tocaba de nuevo.
   */
  it('el panel le ofrece reactivar mientras le queden días', () => {
    const donde = ADMIN.indexOf('Reactivar suscripción');
    expect(donde).toBeGreaterThan(-1);

    const antes = ADMIN.slice(0, donde);
    expect(antes.lastIndexOf("sub.status === 'DADO_DE_BAJA'")).toBeGreaterThan(
      antes.lastIndexOf("sub.status === 'SUSPENDED'"),
    );
  });

  /**
   * Con forma de botón y no de link: como link al final de un párrafo largo
   * se leía como parte de la explicación y no se encontraba.
   */
  it('y el botón se ve como un botón', () => {
    const donde = ADMIN.indexOf('Reactivar suscripción');
    expect(ADMIN.slice(donde - 200, donde)).toContain('class="volver"');
  });

  /** Sin días no hay botón que sirva: hay un cobro que arreglar. */
  it('sin servicio no ofrece un botón que no puede cumplir', () => {
    const desde = ADMIN.indexOf("@if (sub.status === 'SUSPENDED') {");
    expect(desde).toBeGreaterThan(-1);

    const rama = ADMIN.slice(desde, ADMIN.indexOf("@else if (sub.status === 'EXPIRED')", desde));
    expect(rama).not.toContain('class="volver"');
    expect(rama).toContain('appitadaki@gmail.com');
  });

  /** Quien se fue solo y quien dejó de pagar no leen lo mismo. */
  it('distingue quién dio de baja la cuenta', () => {
    const desde = ADMIN.indexOf("@if (sub.status === 'SUSPENDED') {");
    const rama = ADMIN.slice(desde, ADMIN.indexOf("@else if (sub.status === 'EXPIRED')", desde));

    expect(rama).toContain('Dimos de baja tu cuenta.');
    expect(rama).toContain('Diste de baja tu cuenta.');
    expect(rama).toContain('sub.seDioDeBaja');
  });
});
