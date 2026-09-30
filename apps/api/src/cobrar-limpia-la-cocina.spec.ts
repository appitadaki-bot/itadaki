import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Cobrar una mesa limpia su comanda en la cocina y en el salón.
 *
 * El servidor ya dejaba de devolverla, pero las pantallas no se enteraban:
 * cobrar no cambia ningún plato —los deja donde estaban— así que no emite
 * `order.changed`, que es lo único que esas pantallas escuchaban. El cocinero
 * seguía viendo los platos de una mesa que ya pagó y se fue hasta que alguien
 * recargara.
 *
 * El aviso de cierre existía, pero iba sólo a la sala de la sesión —los
 * teléfonos de esa mesa— y la cocina está en la del restaurante.
 */

const APPS = join(__dirname, '..', '..');
const leer = (...ruta: string[]): string =>
  readFileSync(join(APPS, ...ruta), 'utf-8').replace(/\r\n/g, '\n');

const GATEWAY = readFileSync(join(__dirname, 'realtime.gateway.ts'), 'utf-8');
const COCINA = leer('kds-web', 'src', 'app', 'kds.store.ts');
const SALON = leer('floor-web', 'src', 'app', 'floor.store.ts');

describe('el aviso de que una mesa se cerró', () => {
  it('llega al restaurante y no sólo a los teléfonos de esa mesa', () => {
    const emite = GATEWAY.slice(GATEWAY.indexOf('async sessionChanged'));
    const cuerpo = emite.slice(0, emite.indexOf('\n  }'));

    expect(cuerpo).toContain('session:${event.sessionId}');
    expect(cuerpo).toContain('tenant:${event.tenantId}');
  });

  it('pero sólo al cerrarse, no en cada cambio de carrito', () => {
    // Un plato que alguien agrega es cosa de esa mesa. En un salón lleno,
    // redibujar la cocina por cada toque es una avalancha por algo que
    // todavía no se pidió.
    const emite = GATEWAY.slice(GATEWAY.indexOf('async sessionChanged'));
    const cuerpo = emite.slice(0, emite.indexOf('\n  }'));

    expect(cuerpo).toContain("event.reason === 'closed'");
    expect(cuerpo.indexOf("reason === 'closed'")).toBeLessThan(
      cuerpo.indexOf('tenant:${event.tenantId}'),
    );
  });
});

describe('las pantallas del personal lo escuchan', () => {
  it('la cocina', () => {
    expect(COCINA).toContain("this.socket.on('session.changed'");
  });

  it('y el salón', () => {
    expect(SALON).toContain("this.socket.on('session.changed'");
  });

  it('sin pisar lo que quedó sin enviar', () => {
    // Recargar con toques en la cola pinta la vista vieja del servidor encima
    // de lo que la persona ya hizo.
    for (const store of [COCINA, SALON]) {
      const escucha = store.slice(store.indexOf("this.socket.on('session.changed'"));
      expect(escucha.slice(0, escucha.indexOf('});'))).toContain('pending() === 0');
    }
  });
});
