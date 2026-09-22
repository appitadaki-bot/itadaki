import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La barra que filtra las secciones.
 *
 * Antes cada carril se plegaba por su cuenta. Eso ahorraba alto pero no el
 * scroll: para llegar al tercero había que pasar por los dos de arriba igual,
 * plegados o no. Filtrar los saca de la pantalla — tocar "Llaman" deja los
 * llamados solos, sin nada debajo.
 *
 * Lo que se cuida acá es que la barra diga dónde hay trabajo sin entrar a
 * mirar, y que filtrar no reabra el pozo que el rediseño vino a cerrar.
 */

const SALON = readFileSync(join(__dirname, 'floor.component.ts'), 'utf-8').replace(/\r\n/g, '\n');
const ESTILOS = readFileSync(join(__dirname, 'floor.component.css'), 'utf-8').replace(/\r\n/g, '\n');

describe('la barra filtra', () => {
  it('cada carril se muestra sólo si es el elegido, o si está en "todo"', () => {
    for (const carril of ['llamados', 'pase', 'cobro']) {
      expect(SALON).toContain(`@if (mostrar('${carril}'))`);
    }
    expect(SALON).toContain("return this.viendo() === 'todo' || this.viendo() === carril;");
  });

  it('arranca mostrando todo', () => {
    // Quien abre la pantalla todavía no eligió nada: esconderle dos tercios
    // del salón sería decidir por él.
    expect(SALON).toContain("viendo = signal<Vista>('todo')");
  });

  it('al cambiar de pestaña sube al principio', () => {
    // Si no, quien venía scrolleando el final de una lista larga aterriza en
    // el medio de la siguiente.
    expect(SALON).toContain('window.scrollTo({ top: 0');
  });
});

describe('cada pestaña dice cuánto tiene', () => {
  it('con los mismos números que su carril, no con una cuenta aparte', () => {
    const barra = SALON.slice(SALON.indexOf('pestanas = computed'));
    const lista = barra.slice(0, barra.indexOf(']);'));

    expect(lista).toContain('this.store.misLlamados().length');
    expect(lista).toContain('this.store.pickups().length');
    expect(lista).toContain('this.store.misImpagas().length');
  });

  it('y con el color de estado de su carril', () => {
    for (const tono of ['urgente', 'listo', 'cobro']) {
      expect(ESTILOS).toContain(`.pestana-cuenta.${tono}`);
    }
  });

  it('"Todo" no lleva número, que sería la suma y no dice nada nuevo', () => {
    const barra = SALON.slice(SALON.indexOf('pestanas = computed'));
    const todo = barra.slice(barra.indexOf("clave: 'todo'"), barra.indexOf("clave: 'llamados'"));

    expect(todo).toContain('cuenta: 0');
  });

  it('la cuenta desaparece cuando no hay nada', () => {
    // Un cero en la pestaña es ruido: lo que importa es dónde hay trabajo.
    expect(SALON).toContain('@if (p.cuenta > 0)');
  });
});

describe('la pestaña elegida se distingue', () => {
  it('invertida y no sólo con un borde', () => {
    // Entre cuatro píldoras claras, la que tiene el borde un tono más oscuro
    // no se ve de lejos, que es como se mira esto.
    const regla = ESTILOS.slice(
      ESTILOS.indexOf('.pestana.activa {'),
      ESTILOS.indexOf('}', ESTILOS.indexOf('.pestana.activa {')),
    );

    expect(regla).toContain('background: var(--texto)');
    expect(regla).toContain('color: white');
  });

  it('y lo dice, para quien no distingue el color', () => {
    expect(SALON).toContain('aria-current');
  });

  it('se toca como cualquier botón de esta pantalla', () => {
    const regla = ESTILOS.slice(
      ESTILOS.indexOf('.pestana {'),
      ESTILOS.indexOf('}', ESTILOS.indexOf('.pestana {')),
    );

    expect(regla).toContain('min-height: 44px');
  });
});

describe('filtrar no reabre el pozo del medio', () => {
  it('con un solo carril en pantalla ancha, las fichas van en columnas', () => {
    // Una lista angosta a la izquierda dejaría mil píxeles vacíos a la
    // derecha, que es el defecto que el rediseño vino a sacar.
    expect(ESTILOS).toContain('.carriles:has(> .carril:only-child) .carril-cuerpo');
    expect(ESTILOS).toMatch(/only-child\) \.carril-cuerpo \{[\s\S]{0,600}auto-fill/);
  });

  it('con celdas del ancho de una ficha, no de media pantalla', () => {
    // Celdas grandes devolvían el pozo adentro de cada una.
    expect(ESTILOS).toMatch(/auto-fill, minmax\(21rem/);
  });
});
