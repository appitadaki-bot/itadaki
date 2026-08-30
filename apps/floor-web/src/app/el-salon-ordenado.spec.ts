import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Cómo está ordenada la pantalla del salón.
 *
 * Eran cinco listas apiladas en una columna de 640px, separadas sólo por un
 * margen: todo pesaba lo mismo, y el mozo tenía que leer los títulos para
 * saber dónde estaba parado. En la tablet apoyada en el salón sobraban dos
 * tercios de pantalla y había que scrollear para ver si faltaba algo.
 *
 * Lo que se fija acá es la jerarquía, que es lo que se pierde primero cuando
 * alguien agrega un bloque nuevo: lo urgente arriba, lo de consulta abajo.
 */

const PLANTILLA = readFileSync(join(__dirname, 'floor.component.ts'), 'utf-8');
const ESTILOS = readFileSync(join(__dirname, 'floor.component.css'), 'utf-8');

describe('las dos zonas de la pantalla', () => {
  it('lo urgente va antes que lo de consulta', () => {
    // Alguien con la mano levantada y platos enfriándose en el pase: es lo
    // que el mozo mira cuando levanta la vista.
    expect(PLANTILLA.indexOf('class="urgente"')).toBeGreaterThan(-1);
    expect(PLANTILLA.indexOf('class="urgente"')).toBeLessThan(
      PLANTILLA.indexOf('class="consulta"'),
    );
  });

  it('los llamados están en la zona urgente', () => {
    const urgente = PLANTILLA.slice(
      PLANTILLA.indexOf('class="urgente"'),
      PLANTILLA.indexOf('class="consulta"'),
    );

    expect(urgente).toContain('calls-title');
  });

  it('los platos para llevar también', () => {
    const urgente = PLANTILLA.slice(
      PLANTILLA.indexOf('class="urgente"'),
      PLANTILLA.indexOf('class="consulta"'),
    );

    expect(urgente).toContain('pickup-title');
  });

  it('lo que se cocina y los códigos son consulta', () => {
    // Se miran cuando hacen falta, no cada vez que se levanta la vista.
    const consulta = PLANTILLA.slice(PLANTILLA.indexOf('class="consulta"'));

    expect(consulta).toContain('cooking-title');
    expect(consulta).toContain('codes-title');
  });
});

describe('el ancho se adapta a la pantalla', () => {
  it('aprovecha la tablet', () => {
    // 640px fijos dejaban dos tercios vacíos en la tablet del salón.
    expect(ESTILOS).toMatch(/max-width:\s*1400px/);
    expect(ESTILOS).not.toMatch(/max-width:\s*640px/);
  });

  it('pasa a dos columnas cuando hay lugar', () => {
    expect(ESTILOS).toContain('min-width: 900px');
  });

  it('la zona de consulta llega a tres', () => {
    expect(ESTILOS).toContain('min-width: 1250px');
  });

  it('los bloques no se parten entre columnas', () => {
    // Media tarjeta arriba y media abajo es peor que una columna desbalanceada.
    expect(ESTILOS).toContain('break-inside: avoid');
  });
});

describe('cada bloque se distingue sin leerlo', () => {
  it('tiene contenedor propio, no sólo un margen', () => {
    const bloque = ESTILOS.slice(ESTILOS.indexOf('\n.block {'));
    const cuerpo = bloque.slice(0, bloque.indexOf('}'));

    expect(cuerpo).toContain('border');
    expect(cuerpo).toContain('background');
  });

  it('los títulos llevan una marca de color', () => {
    // Cinco títulos en gris claro del mismo tamaño obligaban a leerlos.
    expect(ESTILOS).toMatch(/\.block-title[^{]*::before/);
  });

  it('la marca cambia según lo que hay abajo', () => {
    // Alguien esperando y platos listos no son la misma clase de aviso.
    expect(ESTILOS).toContain('.block:has(.card.call) .block-title::before');
    expect(ESTILOS).toContain('.block:has(.count.ready) .block-title::before');
  });
});
