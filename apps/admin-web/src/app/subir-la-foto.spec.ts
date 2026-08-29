import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Qué ve el dueño mientras se sube una foto.
 *
 * Era una línea al pie del modal que decía "procesando la imagen…" y se
 * quedaba ahí: no se sabía si el servidor seguía trabajando o si se había
 * colgado, y el aviso de que salió bien tampoco se iba nunca, así que la
 * siguiente subida empezaba con el cartel de la anterior en pantalla.
 *
 * Estas comprobaciones son sobre el archivo porque lo que se rompió es
 * estructura de la pantalla, no una función: montar el componente entero
 * pediría el editor de imágenes, la sesión y la API.
 */

const COMPONENTE = readFileSync(join(__dirname, 'admin.component.ts'), 'utf-8');
const ESTILOS = readFileSync(join(__dirname, 'admin.component.css'), 'utf-8');

describe('la cortina de carga', () => {
  it('se muestra mientras se sube', () => {
    expect(COMPONENTE).toContain('@if (subiendo())');
  });

  it('va encima de la foto y no al pie del modal', () => {
    // El aviso al pie hablaba de una foto que estaba a media pantalla de
    // distancia.
    expect(COMPONENTE).toContain('class="editor-zona"');
    expect(ESTILOS).toMatch(/\.cortina\s*\{[^}]*position:\s*absolute/);
  });

  it('la zona del editor ancla la cortina', () => {
    // Sin `position: relative` el `inset: 0` se mide contra la página y la
    // cortina tapa el modal entero.
    expect(ESTILOS).toMatch(/\.editor-zona\s*\{[^}]*position:\s*relative/);
  });

  it('se anuncia a quien no ve la pantalla', () => {
    expect(COMPONENTE).toMatch(/class="cortina"[\s\S]{0,80}role="status"/);
  });

  it('la ruedita no marea a quien pidió no ver movimiento', () => {
    expect(ESTILOS).toContain('prefers-reduced-motion');
  });
});

describe('cuándo se baja la cortina', () => {
  it('siempre, pase lo que pase', () => {
    // Un error de red dejaba el "procesando…" para siempre y el editor
    // inutilizable con una foto ya subida.
    const subida = COMPONENTE.slice(COMPONENTE.indexOf('protected async upload('));

    expect(subida).toMatch(/finally\s*\{\s*this\.subiendo\.set\(false\)/);
  });

  it('el éxito se borra solo', () => {
    // La foto nueva ya se ve: el texto sobra apenas se leyó, y dejarlo hacía
    // dudar de si era de esta subida o de la anterior.
    expect(COMPONENTE).toContain('avisarYBorrar');
    expect(COMPONENTE).toMatch(/SEGUNDOS_DEL_AVISO \* 1000/);
  });

  it('el error se queda', () => {
    // Es lo único que hay que leer y decidir qué hacer.
    const subida = COMPONENTE.slice(COMPONENTE.indexOf('protected async upload('));
    const lineaDelError = subida.split('\n').find((l) => l.includes('`error:'));

    expect(lineaDelError).toContain('this.status.set(');
    expect(lineaDelError).not.toContain('avisarYBorrar');
  });

  it('no borra un aviso que ya cambió', () => {
    // Si entre el éxito y el reloj aparece un error, el reloj del éxito no
    // puede llevárselo puesto.
    expect(COMPONENTE).toMatch(/if \(this\.status\(\) === mensaje\)/);
  });

  it('un aviso nuevo cancela el reloj del anterior', () => {
    // Dos subidas seguidas: el reloj de la primera borraría el aviso de la
    // segunda antes de tiempo.
    expect(COMPONENTE).toContain('clearTimeout(this.borrarElAviso)');
  });
});
