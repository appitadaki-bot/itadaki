import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La ficha de una mesa por cobrar.
 *
 * Los cinco medios de pago vivían en la columna angosta de la derecha, junto
 * al botón de cobrar. No entraban: se desbordaban encima del número de la mesa
 * y del monto, que es justo lo que el mozo necesita leer para cobrar. Con
 * "Transferencia" —la palabra más larga— el desborde tapaba el número.
 *
 * Y los botones usaban la tipografía de los títulos, que es ancha y decorativa
 * a propósito: buena para el número de mesa, mala para una palabra larga
 * dentro de un botón.
 *
 * El rediseño cambió los nombres de las clases, no lo que hay que cuidar.
 */

const PLANTILLA = readFileSync(join(__dirname, 'floor.component.ts'), 'utf-8').replace(
  /\r\n/g,
  '\n',
);
const ESTILOS = readFileSync(join(__dirname, 'floor.component.css'), 'utf-8').replace(/\r\n/g, '\n');

/** El cuerpo de una regla CSS, para mirar adentro sin traerse la que sigue. */
function reglaDe(selector: string): string {
  const desde = ESTILOS.indexOf(selector);
  if (desde === -1) return '';
  return ESTILOS.slice(desde, ESTILOS.indexOf('}', desde));
}

describe('el cobro no se mete en la columna angosta', () => {
  it('la elección del medio está fuera de la columna de acciones', () => {
    // Si vuelve adentro, los cinco botones se desbordan otra vez.
    const ficha = PLANTILLA.slice(
      PLANTILLA.indexOf('misImpagas()'),
      PLANTILLA.indexOf('</article>', PLANTILLA.indexOf('misImpagas()')),
    );
    const panel = ficha.indexOf('class="panel"');
    const cierreColumna = ficha.indexOf('</div>', ficha.indexOf('ficha-accion'));

    expect(panel).toBeGreaterThan(cierreColumna);
  });

  it('el panel ocupa el ancho entero de la ficha', () => {
    // La ficha es una grilla de tres columnas; el panel las cruza.
    expect(reglaDe('.panel {')).toContain('grid-column: 1 / -1');
  });
});

describe('los medios entran', () => {
  it('van en grilla que se acomoda sola, no en una fila fija', () => {
    // En fila, cada uno queda angosto y la palabra más larga se parte o se
    // sale. `auto-fit` los reparte según el ancho que haya.
    const regla = reglaDe('.medios {');
    expect(regla).toContain('grid-template-columns');
    expect(regla).toContain('auto-fit');
  });

  it('sin un ancho máximo que los apriete', () => {
    // Había un `max-width: 8rem` que dejaba a "Transferencia" sin lugar.
    expect(reglaDe('.medio {')).not.toContain('max-width');
  });
});

describe('la tipografía', () => {
  it('los botones usan la de texto, no la de títulos', () => {
    for (const sel of ['.boton {', '.medio {']) {
      expect(reglaDe(sel)).not.toContain('--itadaki-font-display');
    }
  });

  it('el número de mesa y el monto se quedan con la de títulos', () => {
    // Es lo que el mozo busca de un vistazo: ahí lo ancho ayuda.
    for (const sel of ['.ficha-mesa {', '.ficha-monto {']) {
      expect(reglaDe(sel)).toContain('--itadaki-font-display');
    }
  });
});

describe('en el teléfono', () => {
  it('la ficha se estira para que el botón quede contra el borde', () => {
    // En pantalla angosta no sobra ancho: el botón va donde cae el pulgar.
    // En la tablet es al revés —columna fija— o vuelve el pozo del medio.
    expect(ESTILOS).toMatch(/max-width: 719px\)[\s\S]{0,300}\.ficha \{/);
  });

  it('los botones no bajan de 44px, que es lo que el dedo acierta', () => {
    expect(reglaDe('.boton {')).toContain('min-height: 44px');
  });
});
