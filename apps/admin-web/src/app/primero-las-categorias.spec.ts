import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * El orden para cargar la carta.
 *
 * Un plato necesita una categoría, pero la app invitaba al revés: el botón de
 * agregar plato arriba y bien visible, las categorías escondidas en un
 * desplegable cerrado debajo de la carta. Quien empezaba por el botón —que es
 * lo que hace cualquiera— llegaba a un formulario con un select vacío, y el
 * botón de guardar seguía activo aunque guardar siempre fallara.
 *
 * El servidor rechaza el plato sin categoría con un 400, así que la única
 * consecuencia era un error que no explicaba qué hacer.
 */

const PANEL = readFileSync(join(__dirname, 'admin.component.ts'), 'utf-8').replace(/\r\n/g, "\n");

describe('los pasos se muestran en orden', () => {
  it('las categorías son el primero', () => {
    expect(PANEL).toContain('Creá tus categorías');
    expect(PANEL.indexOf('Creá tus categorías')).toBeLessThan(
      PANEL.indexOf('Agregá tus platos'),
    );
  });

  it('el segundo dice que espera al primero', () => {
    // Sin esto, el paso apagado no explica por qué está apagado.
    expect(PANEL).toContain('Después de crear la primera categoría');
  });

  it('el primero se marca como hecho', () => {
    // Ver "1 ✓" es lo que dice que se puede pasar al siguiente.
    expect(PANEL).toContain('paso-listo');
  });
});

describe('no se llega a un formulario que no se puede completar', () => {
  it('el botón de arriba lleva a categorías cuando no hay ninguna', () => {
    expect(PANEL).toContain('Crear mi primera categoría');
  });

  it('el select dice qué falta en vez de quedar vacío', () => {
    // Un desplegable en blanco no explica nada: parece un error de la app.
    expect(PANEL).toContain('Todavía no hay categorías');
  });

  it('el select se apaga sin categorías', () => {
    expect(PANEL).toMatch(/select name="categoryId" \[disabled\]="!hayCategorias\(\)"/);
  });

  it('el botón de guardar se grisea', () => {
    // Dejarlo activo era ofrecer algo que siempre terminaba en un 400 del
    // servidor, que es lo que pasaba.
    expect(PANEL).toMatch(/type="submit"[\s\S]{0,80}\[disabled\]="!hayCategorias\(\)"/);
  });

  it('y dice por qué no se puede guardar', () => {
    expect(PANEL).toMatch(/Creá primero una categoría/);
  });
});

describe('llegar a las categorías', () => {
  it('abre el desplegable, que estaba cerrado', () => {
    // Quien nunca cargó nada no tenía por qué saber que existían.
    expect(PANEL).toContain('[open]="abrirCategorias()"');
  });

  it('lleva la pantalla hasta ahí', () => {
    // Están debajo de la carta: abrirlas sin mover la página deja al dueño
    // mirando el mismo lugar vacío.
    expect(PANEL).toContain('scrollIntoView');
  });

  it('cierra el formulario si estaba abierto', () => {
    const metodo = PANEL.slice(PANEL.indexOf('protected irACategorias()'));
    expect(metodo.slice(0, metodo.indexOf('\n  }'))).toContain('this.closeModal()');
  });
});
