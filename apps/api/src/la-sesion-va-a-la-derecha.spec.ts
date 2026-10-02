import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Quién está trabajando y el botón de salir, contra el borde derecho.
 *
 * El `space-between` del encabezado alcanza mientras el título y la sesión
 * entran en la misma fila. Con `flex-wrap`, en pantalla angosta la sesión baja
 * de renglón — y sola en su renglón `space-between` no la empuja a ningún
 * lado: quedaba pegada a la izquierda, debajo del título, como si fuera parte
 * de él.
 */
const CSS = readFileSync(
  join(__dirname, '..', '..', 'admin-web', 'src', 'app', 'admin.component.css'),
  'utf-8',
).replace(/\r\n/g, '\n');

const reglaDe = (selector: string): string => {
  const desde = CSS.indexOf(selector);
  return desde === -1 ? '' : CSS.slice(desde, CSS.indexOf('}', desde));
};

describe('el bloque de sesión del panel', () => {
  it('se empuja a la derecha también cuando baja de renglón', () => {
    expect(reglaDe('.session {')).toContain('margin-left: auto');
  });

  it('y acomoda sus partes a la derecha', () => {
    // Con el nombre del local y "Cambiar de restaurante" son tres cosas, y en
    // un teléfono no entran en una línea.
    const regla = reglaDe('.session {');
    expect(regla).toContain('flex-wrap: wrap');
    expect(regla).toContain('justify-content: flex-end');
  });

  it('sin tocar el encabezado, que sigue repartiendo título y sesión', () => {
    expect(reglaDe('.head {')).toContain('justify-content: space-between');
  });
});
