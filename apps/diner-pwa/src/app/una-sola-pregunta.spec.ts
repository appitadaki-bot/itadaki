import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Cuántas veces se le pregunta a la mesa cómo paga.
 *
 * Se preguntaba dos: una arriba junto al total —donde el descuento en efectivo
 * cambia lo que se paga— y otra al tocar "pedir la cuenta", en una hoja
 * aparte. Las dos respuestas no se hablaban entre sí.
 *
 * Quien elegía efectivo arriba, veía su descuento, y después tocaba tarjeta en
 * la hoja: le avisaba tarjeta al mozo y seguía viendo el total rebajado. Al
 * revés también. La mesa contestaba lo mismo dos veces y el sistema se quedaba
 * con las dos respuestas, cada una para algo distinto.
 */

const CUENTA = readFileSync(join(__dirname, 'bill.page.ts'), 'utf-8').replace(/\r\n/g, "\n");
const TIMBRE = readFileSync(join(__dirname, 'call-button.component.ts'), 'utf-8').replace(/\r\n/g, "\n");

describe('se pregunta una sola vez', () => {
  it('la segunda hoja ya no existe', () => {
    expect(existsSync(join(__dirname, 'payment-sheet.component.ts'))).toBe(false);
  });

  it('y la cuenta no la abre', () => {
    expect(CUENTA).not.toContain('itd-payment-sheet');
  });

  it('el botón avisa con lo que ya está elegido', () => {
    const metodo = CUENTA.slice(CUENTA.indexOf('protected async pedirLaCuenta('));
    const cuerpo = metodo.slice(0, metodo.indexOf('\n  }'));

    expect(cuerpo).toContain('this.medioElegido()');
  });

  it('sin elegir, avisa que todavía no lo definieron', () => {
    // Es una respuesta y no una respuesta faltante: el mozo se acerca igual y
    // lo resuelven ahí.
    const metodo = CUENTA.slice(CUENTA.indexOf('protected async pedirLaCuenta('));
    const cuerpo = metodo.slice(0, metodo.indexOf('\n  }'));

    expect(cuerpo).toContain("'UNDECIDED'");
  });
});

describe('la pregunta está donde el número cambia', () => {
  it('se muestra siempre, no sólo con descuento', () => {
    // Antes aparecía sólo si el local ofrecía descuento; el resto de las veces
    // se preguntaba en la hoja, que es de dónde venía la doble respuesta.
    const seccion = CUENTA.indexOf('Cómo pagan');
    const condicion = CUENTA.lastIndexOf('@if (ofreceDescuento())', seccion);

    // No hay un `@if (ofreceDescuento())` envolviendo la sección.
    expect(condicion === -1 || condicion < CUENTA.indexOf('<main')).toBe(true);
  });

  it('el ahorro sí depende del descuento', () => {
    // Sin descuento configurado, un "-0%" sería ruido.
    expect(CUENTA).toContain("medio.id === 'CASH' && ofreceDescuento()");
  });

  it('va antes de cómo dividen', () => {
    // El descuento cambia el total, y dividir un número que después baja
    // obliga a rehacer la cuenta.
    expect(CUENTA.indexOf('Cómo pagan')).toBeLessThan(CUENTA.indexOf('Cómo dividimos'));
  });
});

describe('el timbre', () => {
  it('lleva a la cuenta en vez de preguntar aparte', () => {
    // Ahí está el total, la división y el medio: preguntar el medio desde el
    // timbre dejaba a la mesa eligiendo sin ver lo que va a pagar.
    // La rama que navega, no las anteriores que sólo consultan el estado.
    const rama = TIMBRE.indexOf("if (reason === 'BILL') {\n      this.open.set(false);");

    expect(TIMBRE.slice(rama, rama + 200)).toContain("navigate(['/cuenta'])");
  });
});
