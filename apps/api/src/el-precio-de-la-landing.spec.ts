import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Que el precio diga lo mismo en todos lados.
 *
 * Está escrito en cuatro lugares de la landing: el número grande de la
 * tarjeta, el dato estructurado que lee Google, y dos veces en las preguntas
 * frecuentes. Cambiar uno y olvidar otro deja la página contradiciéndose a sí
 * misma, y es la clase de error que nadie ve hasta que lo ve un cliente.
 *
 * El precio de lista tachado no es un adorno: dice que el actual es una
 * promoción, así que el día que suba no se lee como un aumento sorpresa sino
 * como el fin de algo que estaba anunciado desde el principio.
 */

const LANDING = readFileSync(
  join(__dirname, '../../../apps/landing/index.html'),
  'utf-8',
);

/** El precio que se cobra hoy, y el de lista. */
const PRECIO = '12.999';
const PRECIO_SIN_PUNTO = '12999';
const PRECIO_DE_LISTA = '40.000';

describe('el precio del plan', () => {
  it('es el mismo en la tarjeta', () => {
    expect(LANDING).toContain(`<span class="plan-cifra">${PRECIO}</span>`);
  });

  it('y en el dato que lee Google', () => {
    // Si difiere, el buscador puede mostrar un precio distinto del de la
    // página, y eso lo descubre el cliente antes que nosotros.
    expect(LANDING).toContain(`"price": "${PRECIO_SIN_PUNTO}"`);
  });

  it('y en las preguntas frecuentes', () => {
    // Dos veces: una en el JSON-LD y otra en el texto visible.
    const menciones = LANDING.split(`abono mensual fijo de $${PRECIO}`).length - 1;

    expect(menciones).toBe(2);
  });

  it('no quedó ninguna mención del anterior', () => {
    // El que se cobraba antes pasó a ser el de lista, así que sólo puede
    // aparecer tachado: si quedó suelto en algún lado, la página ofrece dos
    // precios distintos y el cliente elige el que leyó primero.
    expect(LANDING).not.toContain('"40000"');
    expect(LANDING).not.toContain('abono mensual fijo de $40.000');
    expect(LANDING).not.toContain('plan-cifra">40.000');
    expect(LANDING).not.toContain('80.000');
  });
});

describe('el precio de lanzamiento', () => {
  it('muestra el de lista tachado', () => {
    // Con `<s>` y no sólo con CSS: quien usa un lector de pantalla también
    // tiene que saber que ese número está cruzado.
    expect(LANDING).toContain(`<s>$${PRECIO_DE_LISTA}</s>`);
  });

  it('dice que es una promoción', () => {
    // Un número tachado solo se lee como un descuento cualquiera; esto dice
    // por qué está rebajado.
    expect(LANDING).toContain('Precio de lanzamiento');
  });

  it('el de lista es más alto que el que se cobra', () => {
    const lista = Number(PRECIO_DE_LISTA.replace('.', ''));
    const hoy = Number(PRECIO_SIN_PUNTO);

    expect(lista).toBeGreaterThan(hoy);
  });

  it('el precio que se paga va primero', () => {
    // Lo primero que se lee tiene que ser lo que cuesta hoy, no el tachado.
    expect(LANDING.indexOf(`plan-cifra">${PRECIO}`)).toBeLessThan(
      LANDING.indexOf('plan-antes'),
    );
  });
});
