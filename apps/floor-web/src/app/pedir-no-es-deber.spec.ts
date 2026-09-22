import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Deber plata no es pedir la cuenta.
 *
 * Al entregarse el último plato la mesa pasa a "por cobrar", que es lo
 * correcto: si no, desaparecía del tablero y el mozo no tenía dónde verla.
 * Pero el bloque entero se pintaba de rojo en ese momento, así que parecía que
 * la mesa estaba esperando para pagar cuando todavía estaba comiendo.
 *
 * El rediseño movió el monto del botón a la ficha —se lee sin tocar nada— y
 * renombró las clases. La distinción que se cuida acá es la misma.
 */
const SALON = readFileSync(join(__dirname, 'floor.component.ts'), 'utf-8').replace(/\r\n/g, '\n');
const ESTILOS = readFileSync(join(__dirname, 'floor.component.css'), 'utf-8').replace(/\r\n/g, '\n');
const TIENDA = readFileSync(join(__dirname, 'floor.store.ts'), 'utf-8').replace(/\r\n/g, '\n');

describe('pedir la cuenta y deber plata son cosas distintas', () => {
  it('se sabe quién la pidió, por el llamado', () => {
    expect(TIENDA).toContain("call.reason === 'BILL'");
  });

  it('la ficha se marca sólo si esa mesa la pidió', () => {
    expect(SALON).toContain('[class.piden]="store.pidieronLaCuenta().has(mesa.sessionId)"');
  });

  it('y lo dice con todas las letras, no sólo con un color', () => {
    // Un borde de color no se lee si no se sabe qué significa, y quien no
    // distingue rojo de gris no lo ve en absoluto.
    const bloque = SALON.slice(SALON.indexOf('class="ficha cobrar'));
    const ficha = bloque.slice(0, bloque.indexOf('</article>'));

    expect(ficha).toContain('Pidieron la cuenta');
  });

  it('el color de alarma cuelga de esa marca, no de deber a secas', () => {
    // `.marca.piden` es la etiqueta, que sí lleva el rojo. La ficha por deber
    // plata no lo lleva: se pinta sólo cuando la pidieron.
    expect(ESTILOS).toContain('.marca.piden');

    const regla = ESTILOS.slice(
      ESTILOS.indexOf('.ficha {'),
      ESTILOS.indexOf('}', ESTILOS.indexOf('.ficha {')),
    );
    expect(regla).not.toContain('--alarma');
  });
});

describe('el total de la mesa se dice una sola vez', () => {
  it('en la ficha, que se lee sin tocar nada', () => {
    const bloque = SALON.slice(SALON.indexOf('class="ficha cobrar'));
    const ficha = bloque.slice(0, bloque.indexOf('</article>'));

    expect(ficha).toContain('<span class="ficha-monto">{{ money(mesa.owed) }}</span>');
    // Y no repetido adentro del botón, que decía lo mismo dos veces.
    expect(ficha).not.toContain('Cobré {{ money(');
  });

  it('salvo al confirmar que se libera sin cobrar, donde hay que releerlo', () => {
    // Ahí el monto es la advertencia: es la plata que se va sin cobrar.
    expect(SALON).toContain('¿Liberar sin cobrar {{ money(mesa.owed) }}?');
  });
});
