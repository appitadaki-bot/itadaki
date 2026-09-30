import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Sacar un plato se ve sin recargar.
 *
 * El mozo le avisa a la mesa que no hay pescado y lo saca. Eso toca el
 * pedido, no la mesa: emite `order.changed` y no `session.changed`. La
 * pantalla de la cuenta sólo escuchaba lo segundo, así que el que estaba
 * mirando la cuenta seguía viendo el plato —con su precio adentro del
 * total— hasta recargar la página. La del pedido sí se enteraba, y las dos
 * pantallas del mismo teléfono decían cosas distintas.
 */
const CUENTA = readFileSync(join(__dirname, 'bill.page.ts'), 'utf-8');
const SESION = readFileSync(join(__dirname, 'session.store.ts'), 'utf-8');
const SEGUIMIENTO = readFileSync(join(__dirname, 'tracking.store.ts'), 'utf-8');

describe('la cuenta se entera de que sacaron un plato', () => {
  it('escucha los cambios del pedido, no sólo los de la mesa', () => {
    expect(CUENTA).toContain('this.session.onOrderChanged(releer)');
  });

  it('y sigue escuchando los de la mesa, que es como ve el cobro', () => {
    expect(CUENTA).toContain('this.session.onSessionChanged(releer)');
  });

  it('deja de escuchar las dos cosas al cerrarse', () => {
    // Una suscripción que sobrevive a la pantalla pide la cuenta de una mesa
    // que ya no se está mirando.
    const cuerpo = CUENTA.slice(CUENTA.indexOf('inject(DestroyRef).onDestroy'));
    expect(cuerpo).toContain('dejarDeEscuchar()');
    expect(cuerpo).toContain('dejarDeEscucharPlatos()');
  });

  it('no relee una cuenta ya cobrada', () => {
    // Cerrada no cambia más: seguir pidiéndola es ruido contra el servidor.
    expect(CUENTA).toContain('hayQueReleerLaCuenta(id, this.store.bill()?.status)');
  });
});

describe('la mesa se relee cuando cambia un plato', () => {
  it('el total de arriba lleva adentro lo ya enviado a la cocina', () => {
    // Sin esto el teléfono seguía sumando un plato que ya no existe.
    const manejador = SESION.slice(SESION.indexOf("this.socket.on('order.changed'"));
    expect(manejador.slice(0, 400)).toContain('void this.refresh(sessionId);');
  });

  it('y el seguimiento vuelve a pedir los pedidos', () => {
    expect(SEGUIMIENTO).toContain('this.session.onOrderChanged(');
  });
});
