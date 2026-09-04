import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La tarjeta de una mesa por cobrar.
 *
 * Los cinco medios de pago vivían en la columna angosta de la derecha, junto
 * al botón de cobrar. No entraban: se desbordaban encima del nombre de la mesa
 * y del monto, que es justo lo que el mozo necesita leer para cobrar. Con
 * "Transferencia" —la palabra más larga— el desborde tapaba el número.
 *
 * Y los botones usaban la tipografía de los títulos, que es ancha y decorativa
 * a propósito: buena para "ITADAKI" arriba de todo, mala para una palabra
 * larga dentro de un botón.
 */

const PLANTILLA = readFileSync(join(__dirname, 'floor.component.ts'), 'utf-8').replace(/\r\n/g, "\n");
const ESTILOS = readFileSync(join(__dirname, 'floor.component.css'), 'utf-8').replace(/\r\n/g, "\n");

describe('el cobro no se mete en la columna angosta', () => {
  it('la elección del medio está fuera de la columna lateral', () => {
    // Si vuelve adentro, los cinco botones se desbordan otra vez.
    const tarjeta = PLANTILLA.slice(
      PLANTILLA.indexOf('misImpagas()'),
      PLANTILLA.indexOf('</article>', PLANTILLA.indexOf('misImpagas()')),
    );
    const zona = tarjeta.indexOf('cobro-zona');
    const cierreColumna = tarjeta.indexOf('</div>', tarjeta.indexOf('card-side'));

    expect(zona).toBeGreaterThan(cierreColumna);
  });

  it('los datos y los botones van en su propia fila', () => {
    expect(PLANTILLA).toContain('class="card-fila"');
  });

  it('la zona de cobro ocupa el ancho', () => {
    expect(ESTILOS).toContain('.cobro-zona');
  });
});

describe('los cinco medios entran', () => {
  it('van en grilla, no en una fila', () => {
    // Cinco en fila obligan a que cada uno sea angosto, y ahí la palabra más
    // larga se parte o se sale.
    const bloque = ESTILOS.slice(ESTILOS.indexOf('.cobro-row {'));
    expect(bloque.slice(0, bloque.indexOf('}'))).toContain('grid-template-columns');
  });

  it('sin el ancho máximo que los apretaba', () => {
    // Había un `max-width: 8rem` que dejaba a "Transferencia" sin lugar. Se
    // sacó en vez de anularse después, que es lo que hacía falta.
    const bloque = ESTILOS.slice(ESTILOS.indexOf('.cobro {'));
    expect(bloque.slice(0, bloque.indexOf('}'))).not.toContain('max-width');
  });

  it('una palabra larga no se corta a la mitad', () => {
    expect(ESTILOS).toContain('overflow-wrap: break-word');
  });
});

describe('la tipografía de los botones', () => {
  it('los botones usan la de texto, no la de títulos', () => {
    for (const sel of ['.action {', '.cobro {']) {
      const bloque = ESTILOS.slice(ESTILOS.indexOf(sel));
      const cuerpo = bloque.slice(0, bloque.indexOf('}'));

      expect(cuerpo).not.toContain('--itadaki-font-display');
    }
  });

  it('el número de mesa y el monto se quedan con la de títulos', () => {
    // Es lo que el mozo busca de un vistazo: ahí lo ancho ayuda.
    for (const sel of ['.table {', '.amount {']) {
      const bloque = ESTILOS.slice(ESTILOS.indexOf(sel));
      expect(bloque.slice(0, bloque.indexOf('}'))).toContain('--itadaki-font-display');
    }
  });
});

describe('en el teléfono', () => {
  it('la tarjeta se apila', () => {
    // "Mesa 1" y "$ 9.000" al lado de dos botones no entran en 390px.
    expect(ESTILOS).toMatch(/max-width: 560px\)[\s\S]{0,400}\.card-fila/);
  });
});
