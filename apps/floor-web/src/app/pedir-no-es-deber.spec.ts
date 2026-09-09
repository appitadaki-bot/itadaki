import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Deber plata no es pedir la cuenta.
 *
 * Al entregarse el último plato la mesa pasa a "pendiente de cobro", que es lo
 * correcto: si no, desaparecía del tablero y el mozo no tenía dónde verla.
 * Pero el bloque entero se pintaba de rojo en ese momento, así que parecía que
 * la mesa estaba esperando para pagar cuando todavía estaba comiendo.
 */
const SALON = readFileSync(join(__dirname, 'floor.component.ts'), 'utf-8').replace(/\r\n/g, '\n');
const ESTILOS = readFileSync(join(__dirname, 'floor.component.css'), 'utf-8').replace(/\r\n/g, '\n');
const TIENDA = readFileSync(join(__dirname, 'floor.store.ts'), 'utf-8').replace(/\r\n/g, '\n');

describe('pedir la cuenta y deber plata son cosas distintas', () => {
  it('se sabe quién la pidió, por el llamado', () => {
    expect(TIENDA).toContain("call.reason === 'BILL'");
  });

  it('la tarjeta se marca sólo si esa mesa la pidió', () => {
    expect(SALON).toContain("[class.piden]=\"store.pidieronLaCuenta().has(mesa.sessionId)\"");
  });

  it('y el bloque, sólo si alguna de las suyas la pidió', () => {
    expect(SALON).toContain('[class.piden]="algunaPideLaCuenta()"');
  });

  it('el rojo vive detrás de esa marca, no en la tarjeta a secas', () => {
    const franja = ESTILOS.slice(ESTILOS.indexOf('.card.owing-card {'));
    // La tarjeta sin pedir lleva el borde neutro; el rojo cuelga de `.piden`.
    expect(franja).toContain('border-left: 5px solid var(--itadaki-border)');
    expect(ESTILOS).toContain('.card.owing-card.piden');
  });

  it('el fondo del bloque también', () => {
    expect(ESTILOS).toContain('.urgente > .block.owing.piden');
    expect(ESTILOS).not.toContain('.urgente > .block.owing {');
  });
});

describe('el total de la mesa se dice una sola vez', () => {
  it('en el botón, que es lo que se confirma al tocarlo', () => {
    const bloque = SALON.slice(SALON.indexOf('class="card owing-card"'));
    const tarjeta = bloque.slice(0, bloque.indexOf('</article>'));

    expect(tarjeta).toContain('Cobré {{ money(');
    // Estaba también al lado del nombre de la mesa, diciendo lo mismo.
    expect(tarjeta).not.toContain('<span class="amount">');
  });
});
