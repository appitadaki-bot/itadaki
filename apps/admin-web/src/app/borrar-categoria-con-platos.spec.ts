import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La × de una categoría con platos.
 *
 * Estaba apagada, y la explicación —"primero movés lo que tiene"— vivía en un
 * `title` que sólo aparece dejando el mouse quieto encima. En el celular no
 * existe: se veía un botón roto.
 */
const PANEL = readFileSync(join(__dirname, 'admin.component.ts'), 'utf-8').replace(/\r\n/g, '\n');

describe('borrar una categoría que tiene platos', () => {
  const boton = (() => {
    const donde = PANEL.indexOf('class="cat-del"');
    return PANEL.slice(PANEL.lastIndexOf('<button', donde), PANEL.indexOf('</button>', donde));
  })();

  it('la × siempre se puede tocar', () => {
    expect(boton).not.toContain('[disabled]');
  });

  it('y pregunta antes de borrar, en vez de fallar', () => {
    expect(boton).toContain('pedirBorrarCategoria(');
  });

  it('pregunta a qué categoría pasar los platos', () => {
    expect(PANEL).toContain('@if (borrandoCategoria(); as borrando)');
    expect(PANEL).toContain('otrasCategorias(borrando.id)');
  });

  it('manda el destino junto con el borrado', () => {
    expect(PANEL).toContain('?moverA=${encodeURIComponent(moverA)}');
  });

  it('si es la única categoría, dice qué hacer en vez de abrir un desplegable vacío', () => {
    expect(PANEL).toContain('es la única categoría. Creá otra para pasarle los platos');
  });
});
