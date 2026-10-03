import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Dónde se cargan los alérgenos de un plato.
 *
 * La carta y la comanda los mostraban desde que el sistema existe, pero no
 * había dónde cargarlos: lo único que aparecía eran los de la carta de
 * ejemplo, que el dueño no podía cambiar ni sacar.
 *
 * Van en los dos formularios y no sólo en el de editar. Un plato que nace sin
 * alérgenos sale a la carta diciendo que no contiene nada, y nadie vuelve a
 * abrirlo para corregirlo —el mismo motivo por el que las dietas ya estaban en
 * el alta—. Acá el costo es peor que un filtro que no encuentra: la cocina lee
 * esto para decidir si el plato sale de la freidora compartida.
 */

const PANEL = readFileSync(join(__dirname, 'admin.component.ts'), 'utf-8').replace(/\r\n/g, '\n');

/** El formulario de alta termina donde empieza el modal de la foto. */
const ALTA = PANEL.slice(
  PANEL.indexOf('createProduct($event)'),
  PANEL.indexOf("modal() === 'foto'"),
);

/** El de editar, desde su submit hasta el modal siguiente. */
const EDITAR = PANEL.slice(
  PANEL.indexOf('saveDish($event, dish)'),
  PANEL.indexOf("modal() === 'equipo'"),
);

describe('el tilde de "Contiene"', () => {
  it('está al crear el plato', () => {
    expect(ALTA).toContain('<legend>Contiene</legend>');
  });

  it('y también al editarlo', () => {
    expect(EDITAR).toContain('<legend>Contiene</legend>');
  });

  it('sale del vocabulario del dominio y no de una lista escrita acá', () => {
    // Una lista propia se desincroniza en silencio el día que alguien agrega
    // un alérgeno: la carta lo muestra y el panel no lo ofrece.
    expect(PANEL).toContain('ALLERGENS.map');
    expect(PANEL).toContain('NOMBRE_DEL_ALERGENO');
  });
});

describe('lo que se tilda llega al servidor', () => {
  it('al crear', () => {
    const metodo = PANEL.slice(PANEL.indexOf('protected async createProduct('));
    expect(metodo.slice(0, metodo.indexOf('\n  }\n'))).toContain('allergens:');
  });

  it('y al guardar los cambios', () => {
    const metodo = PANEL.slice(PANEL.indexOf('protected async saveDish('));
    expect(metodo.slice(0, metodo.indexOf('\n  }\n'))).toContain('allergens,');
  });
});

/**
 * "Contiene" y "Apto para" son dos preguntas distintas.
 *
 * Una la lee quien elige —vegano, sin gluten— y la otra quien cocina. "Sin
 * gluten" ya se dice en las dietas; esto es la lista de lo que el plato tiene,
 * no de lo que no.
 */
describe('no se mezcla con las dietas', () => {
  it('son dos grupos separados en los dos formularios', () => {
    for (const formulario of [ALTA, EDITAR]) {
      expect(formulario).toContain('<legend>Apto para</legend>');
      expect(formulario).toContain('<legend>Contiene</legend>');
    }
  });

  it('y cada uno manda lo suyo', () => {
    expect(PANEL).toContain("'diet-' + diet.id");
    expect(PANEL).toContain("'alergeno-' + alergeno.id");
  });
});
