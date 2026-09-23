import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Cómo está ordenada la pantalla del salón.
 *
 * Eran cinco listas apiladas en una columna, separadas sólo por un margen:
 * todo pesaba lo mismo y había que leer los títulos para saber dónde se estaba
 * parado. Después fueron dos columnas en un contenedor de 1400px, y ahí
 * apareció el problema contrario: el número de mesa contra el borde izquierdo,
 * el botón contra el derecho, y un pozo de blanco en el medio.
 *
 * Ahora son tres carriles con el mismo peso —quién llama, qué llevar, a quién
 * cobrarle— y abajo lo que se consulta. Lo que se fija acá es esa jerarquía,
 * que es lo primero que se pierde cuando alguien agrega un bloque nuevo.
 */

const PLANTILLA = readFileSync(join(__dirname, 'floor.component.ts'), 'utf-8').replace(
  /\r\n/g,
  '\n',
);
const ESTILOS = readFileSync(join(__dirname, 'floor.component.css'), 'utf-8').replace(/\r\n/g, '\n');

describe('las dos zonas de la pantalla', () => {
  it('los carriles van antes que lo de consulta', () => {
    const carriles = PLANTILLA.indexOf('class="carriles"');
    const consulta = PLANTILLA.indexOf('class="consulta"');

    expect(carriles).toBeGreaterThan(-1);
    expect(carriles).toBeLessThan(consulta);
  });

  it('son los tres trabajos del mozo, en ese orden', () => {
    // Una persona con la mano levantada gana sobre un plato en el pase: el
    // plato se enfría, la persona se va.
    const zona = PLANTILLA.slice(
      PLANTILLA.indexOf('class="carriles"'),
      PLANTILLA.indexOf('class="consulta"'),
    );

    expect(zona.indexOf('carril-llamados')).toBeLessThan(zona.indexOf('carril-pase'));
    expect(zona.indexOf('carril-pase')).toBeLessThan(zona.indexOf('carril-cobro'));
  });

  it('lo que se cocina y los códigos son consulta', () => {
    // Se miran cuando hacen falta, no cada vez que se levanta la vista.
    const consulta = PLANTILLA.slice(PLANTILLA.indexOf('class="consulta"'));

    expect(consulta).toContain('En cocina');
    expect(consulta).toContain('Códigos de mesa');
  });

  it('y arrancan plegados, porque son contexto y no trabajo', () => {
    expect(PLANTILLA).toContain('showCooking = signal(false)');
    expect(PLANTILLA).toContain('showCodes = signal(false)');
  });
});

describe('el ancho se adapta a las dos pantallas', () => {
  it('una sola columna en el teléfono', () => {
    const regla = ESTILOS.slice(
      ESTILOS.indexOf('.carriles {'),
      ESTILOS.indexOf('}', ESTILOS.indexOf('.carriles {')),
    );
    expect(regla).toContain('grid-template-columns: 1fr');
  });

  it('dos columnas cuando hay algo de lugar, y tres en la tablet', () => {
    expect(ESTILOS).toContain('min-width: 720px');
    expect(ESTILOS).toContain('min-width: 1080px');
  });

  it('con un tope de ancho, o vuelve el pozo del medio', () => {
    // Sin tope, tres columnas en un monitor ancho separan tanto el texto del
    // botón que se vuelve al problema que esto arregló.
    expect(ESTILOS).toMatch(/max-width:\s*1600px/);
  });

  it('un carril lleno se queda con el espacio de los vacíos', () => {
    // Tres columnas iguales con dieciséis llamados de un lado y "nadie debe
    // nada" del otro es exactamente el desbalance que se veía.
    expect(ESTILOS).toContain('.carriles:has(.vacio)');
  });
});

describe('cada carril se distingue sin leerlo', () => {
  it('tiene contenedor propio, no sólo un margen', () => {
    const regla = ESTILOS.slice(
      ESTILOS.indexOf('.carril {'),
      ESTILOS.indexOf('}', ESTILOS.indexOf('.carril {')),
    );

    expect(regla).toContain('border');
    expect(regla).toContain('background');
  });

  it('la cuenta de cada uno lleva su propio color de estado', () => {
    // Alguien esperando, un plato listo y plata sin cobrar no son la misma
    // clase de aviso.
    expect(ESTILOS).toContain('.carril-cuenta.urgente');
    expect(ESTILOS).toContain('.carril-cuenta.listo');
    expect(ESTILOS).toContain('.carril-cuenta.cobro');
  });

  it('y esos colores son los tres del sistema, sin inventar otro', () => {
    for (const token of ['--alarma', '--listo', '--plata']) {
      expect(ESTILOS).toContain(`${token}:`);
    }
  });
});

describe('la espera se ve, no sólo se lee', () => {
  it('una ficha que esperó mucho se marca', () => {
    expect(ESTILOS).toContain('.ficha.espera-larga');
    expect(ESTILOS).toContain('.ficha.espera-critica');
  });

  it('pero nunca se marcan todas a la vez', () => {
    // Con el salón desbordado, un umbral fijo pinta las dieciséis y la
    // pantalla vuelve a no decir nada. Sólo se marcan las peores.
    expect(PLANTILLA).toContain('CUANTAS_CRITICAS');
    expect(PLANTILLA).toContain('.slice(0, CUANTAS_CRITICAS)');
  });
});
