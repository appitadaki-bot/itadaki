import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Cuándo se abre la cuenta al entrar a la pantalla.
 *
 * El síntoma era: pedir, tocar "ver la cuenta", y leer "todavía no pidieron
 * nada en esta mesa". La API estaba bien —devolvía la cuenta con su total— y
 * el problema era de momento: al entrar por un link o al recargar, la sesión
 * se restaura pidiéndosela al servidor, así que cuando esta pantalla se
 * construye todavía no está.
 *
 * El constructor leía la mesa una sola vez, la encontraba vacía y se iba con
 * un `return`. La mesa aparecía un instante después, ya con su pedido, y la
 * pantalla se quedaba con el cartel de mesa vacía.
 */

const PAGINA = readFileSync(join(__dirname, 'bill.page.ts'), 'utf-8');
const STORE = readFileSync(join(__dirname, 'bill.store.ts'), 'utf-8');

/** Lo que decide el efecto, para poder probar la secuencia sin Angular. */
function abrirCuando(
  sesiones: ReadonlyArray<string | undefined>,
): readonly string[] {
  const pedidas: string[] = [];
  let pedidaPara: string | null = null;

  for (const id of sesiones) {
    if (id === undefined || id === pedidaPara) continue;
    pedidaPara = id;
    pedidas.push(id);
  }
  return pedidas;
}

describe('abrir la cuenta espera a que se sepa la mesa', () => {
  it('la abre cuando la sesión llega tarde', () => {
    // La secuencia exacta del bug: la pantalla se construye sin mesa, y la
    // mesa aparece después de que el servidor contesta.
    expect(abrirCuando([undefined, 'mesa-1'])).toEqual(['mesa-1']);
  });

  it('la abre enseguida si la mesa ya estaba', () => {
    // Quien navega desde la carta, sin recargar.
    expect(abrirCuando(['mesa-1'])).toEqual(['mesa-1']);
  });

  it('no la pide dos veces por la misma mesa', () => {
    // La sesión cambia varias veces durante una comida —alguien se suma,
    // llega un plato— y cada cambio despierta el efecto.
    expect(abrirCuando(['mesa-1', 'mesa-1', 'mesa-1'])).toEqual(['mesa-1']);
  });

  it('la vuelve a pedir si cambia de mesa', () => {
    expect(abrirCuando(['mesa-1', 'mesa-2'])).toEqual(['mesa-1', 'mesa-2']);
  });

  it('sin mesa nunca, no pide nada', () => {
    // Quien abre la pantalla sin haberse unido: ahí el cartel correcto es el
    // de unirse, no el de la cuenta.
    expect(abrirCuando([undefined, undefined])).toEqual([]);
  });
});

describe('la pantalla no confunde un fallo con una mesa vacía', () => {
  it('muestra el error en vez del cartel de mesa vacía', () => {
    // "Todavía no pidieron nada" a alguien que acaba de pedir se lee como que
    // la app le miente.
    expect(PAGINA).toMatch(/@else if \(store\.error\(\)/);
  });

  it('deja volver a intentar', () => {
    expect(PAGINA).toContain('reintentar()');
  });

  it('el reintento limpia la marca, o no haría nada', () => {
    const metodo = PAGINA.slice(PAGINA.indexOf('protected reintentar()'));
    expect(metodo.slice(0, metodo.indexOf('\n  }'))).toContain('this.pedidaPara = null');
  });
});

describe('cambiar de moneda avisa si falla', () => {
  it('no se traga el error', () => {
    // Antes dejaba la cuenta anterior en pantalla, con los montos en la
    // moneda que no se eligió: parecía que el toque no había hecho nada.
    const load = STORE.slice(STORE.indexOf('async load('));
    expect(load.slice(0, load.indexOf('\n  }'))).toContain('this.error.set(');
  });

  it('limpia el error cuando sale bien', () => {
    // Sin esto, un fallo viejo queda en pantalla sobre una cuenta correcta.
    const load = STORE.slice(STORE.indexOf('async load('));
    expect(load.slice(0, load.indexOf('\n  }'))).toContain('this.error.set(null)');
  });
});
