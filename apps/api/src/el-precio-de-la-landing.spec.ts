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

  it('es el único número de precio en la tarjeta', () => {
    // Dos cifras juntas obligan a averiguar cuál se paga, y eso es trabajo en
    // la pantalla que decide. El precio de lista se sacó por eso.
    expect(LANDING).not.toContain('40.000');
    expect(LANDING).not.toContain('"40000"');
    expect(LANDING).not.toContain('80.000');
  });
});

describe('el precio de lanzamiento', () => {
  it('dice que es una promoción, sin otro número al lado', () => {
    // Para que el día que suba no se lea como un aumento sorpresa sino como
    // el fin de algo anunciado. Sin el tachado: dos cifras juntas obligan a
    // averiguar cuál se paga.
    expect(LANDING).toContain('Precio de lanzamiento');
    expect(LANDING).not.toContain('<s>$');
  });
});

describe('lo que incluye el plan', () => {
  it('nombra lo que hacemos nosotros, no sólo lo que hace el sistema', () => {
    // Es la diferencia con las plataformas que dan un panel vacío, y estaba
    // sólo más abajo en la página — donde no se lee al comparar precios.
    for (const item of ['Capacitamos a tu equipo', 'Mejoras continuas', 'Rol de caja']) {
      expect(LANDING).toContain(item);
    }
  });

  it('y cuándo arrancan los 30 días, como un ítem más', () => {
    // Era una nota al pie de una sola tarjeta, y dejaba los dos botones a
    // distinta altura.
    expect(LANDING).toContain('Los 30 días de prueba arrancan con tu primer pedido');
    expect(LANDING).not.toContain('class="plan-nota"');
  });
});
