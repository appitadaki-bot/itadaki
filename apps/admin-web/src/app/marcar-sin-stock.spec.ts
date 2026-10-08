import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Marcar un plato sin stock desde el panel.
 *
 * La carta ya mostraba la chapa "Sin stock" y la API ya tenía el endpoint para
 * cambiarlo, pero no había dónde tocarlo: el único que podía sacar un plato de
 * la carta era quien supiera hacer el POST a mano. En el medio del servicio,
 * cuando se acaba el pescado, eso significa que se sigue pidiendo.
 *
 * Lo que se fija acá es por dónde va y cuándo guarda, que es lo que se pierde
 * si alguien lo unifica con el resto del formulario.
 */

const PANEL = readFileSync(join(__dirname, 'admin.component.ts'), 'utf-8').replace(/\r\n/g, '\n');
const ESTILOS = readFileSync(join(__dirname, 'admin.component.css'), 'utf-8').replace(/\r\n/g, '\n');

describe('el tilde de sin stock', () => {
  it('va por el endpoint de disponibilidad, no por el PATCH del plato', () => {
    // El PATCH guarda nombre y precio; éste además anota en la bitácora que el
    // plato quedó sin stock, en vez de una edición cualquiera.
    expect(PANEL).toContain('/availability');
  });

  it('guarda al tocarlo y no con "Guardar cambios"', () => {
    // Esperar al botón de guardar es que el plato se siga pidiendo mientras
    // alguien termina de completar el formulario.
    const metodo = PANEL.slice(PANEL.indexOf('protected async marcarSinStock('));
    expect(metodo.slice(0, metodo.indexOf('\n  }\n'))).toContain("method: 'POST'");
    expect(PANEL).toContain('(change)="marcarSinStock(dish, $event)"');
  });

  it('el tilde dice lo que falta, no lo que hay', () => {
    // `available` del dominio es al revés que el tilde: tildado es sin stock.
    expect(PANEL).toContain('[checked]="!dish.available"');
  });

  it('si el servidor no lo acepta, el tilde vuelve', () => {
    // Dejarlo tildado diciendo que no hay stock cuando el servidor no se
    // enteró es peor que no haberlo tocado: el plato se sigue pidiendo y la
    // pantalla dice que no.
    const metodo = PANEL.slice(PANEL.indexOf('protected async marcarSinStock('));
    const cuerpo = metodo.slice(0, metodo.indexOf('\n  }\n'));
    expect(cuerpo).toContain('casilla.checked = !casilla.checked');
  });

  it('no se puede tocar dos veces mientras va en camino', () => {
    expect(PANEL).toContain('[disabled]="cambiandoStock() === dish.id"');
  });
});

describe('se distingue de los otros tildes', () => {
  it('tiene contenedor propio y no es uno más de la lista', () => {
    // Los de "Apto para" y "Contiene" son listas que esperan a guardar; éste
    // sale solo. Suelto entre ellos se leía como uno más.
    const regla = ESTILOS.slice(ESTILOS.indexOf('.check.sin-stock {'));
    const cuerpo = regla.slice(0, regla.indexOf('}'));

    expect(cuerpo).toContain('border');
    expect(cuerpo).toContain('padding');
  });

  it('y tildado se nota sin leerlo', () => {
    expect(ESTILOS).toContain('.check.sin-stock:has(input:checked)');
  });
});
