import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Que el panel pueda distinguir al que se dio de baja del que dejó de pagar.
 *
 * Los dos llegan como `SUSPENDED`, así que sin `seDioDeBaja` en la respuesta
 * son indistinguibles y los dos ven el cartel de "escribinos". Eso dejaba a
 * quien se había dado de baja desde el panel sin forma de volver desde el
 * panel — la puerta abría para un solo lado.
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

  it('el panel le ofrece volver al que se dio de baja', () => {
    expect(ADMIN).toContain("sub.status === 'SUSPENDED' && sub.seDioDeBaja");
    expect(ADMIN).toContain('Volver a suscribirme');
  });

  /**
   * Con forma de botón y no de link: como link al final de un párrafo largo
   * se leía como parte de la explicación y no se encontraba.
   */
  it('y el botón se ve como un botón', () => {
    const donde = ADMIN.indexOf('Volver a suscribirme');
    expect(ADMIN.slice(donde - 200, donde)).toContain('class="volver"');

    const seguir = ADMIN.indexOf('Seguir con Itadaki');
    expect(ADMIN.slice(seguir - 200, seguir)).toContain('class="volver"');
  });

  /** Al que dejó de pagar se le pide que pague, no que vuelva. */
  it('al que dejó de pagar no le ofrece volver', () => {
    const suspendido = ADMIN.indexOf("sub.status === 'SUSPENDED' && sub.seDioDeBaja");
    expect(suspendido).toBeGreaterThan(-1);
    // La rama sin `seDioDeBaja` sigue siendo la que dice "escribinos".
    expect(ADMIN).toContain('Escribinos y lo resolvemos.');
  });
});
