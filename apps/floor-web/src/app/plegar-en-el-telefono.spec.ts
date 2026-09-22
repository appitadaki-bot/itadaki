import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Plegar los carriles, para el teléfono.
 *
 * En la tablet los tres se ven a la vez y ése es el punto de esa pantalla. En
 * el teléfono se apilan, y tres apilados son mucho scroll cuando sólo importa
 * uno: el mozo que está levantando pedidos no necesita las cuentas abiertas.
 *
 * Lo que se cuida acá es que plegar no esconda la información que decide si
 * hay que abrirlo, y que la pantalla ancha no herede un carril cerrado.
 */

const SALON = readFileSync(join(__dirname, 'floor.component.ts'), 'utf-8').replace(/\r\n/g, '\n');
const ESTILOS = readFileSync(join(__dirname, 'floor.component.css'), 'utf-8').replace(/\r\n/g, '\n');

describe('los tres carriles se pliegan', () => {
  it('cada uno por su nombre', () => {
    for (const carril of ['llamados', 'pase', 'cobro']) {
      expect(SALON).toContain(`@if (abierto('${carril}'))`);
      expect(SALON).toContain(`(click)="plegar('${carril}')"`);
    }
  });

  it('el encabezado dice si está abierto, para quien no ve la flecha', () => {
    for (const carril of ['llamados', 'pase', 'cobro']) {
      expect(SALON).toContain(`[attr.aria-expanded]="abierto('${carril}')"`);
    }
  });

  it('sigue siendo un título, no sólo un botón', () => {
    // Para poder saltar de carril en carril con el lector de pantalla.
    expect(SALON).toContain('<h2 class="carril-head-titulo">');
  });
});

describe('plegado sigue diciendo lo que importa', () => {
  it('la cuenta vive en el encabezado, no en el cuerpo', () => {
    // Es lo que decide si vale la pena abrirlo: un carril cerrado que no dice
    // cuántos tiene obliga a abrirlo para saber si hacía falta.
    const cabecera = SALON.slice(
      SALON.indexOf('<h2 class="carril-head-titulo">'),
      SALON.indexOf('</h2>'),
    );

    expect(cabecera).toContain('carril-cuenta');
    expect(cabecera).toContain('store.misLlamados().length');
  });

  it('y se ve igual que uno abierto', () => {
    // Uno gris entre dos blancos parecía deshabilitado.
    expect(ESTILOS).toContain(".carril-head[aria-expanded='false']");
  });
});

describe('en la pantalla ancha no se pliega', () => {
  it('la lógica reporta todo abierto a partir del corte de tres columnas', () => {
    expect(SALON).toContain("window.matchMedia('(min-width: 1080px)')");
    expect(SALON).toContain('if (!this.angosta()) return true;');
  });

  it('y la flecha desaparece, porque no hay nada que plegar', () => {
    expect(ESTILOS).toMatch(/min-width: 1080px\)[\s\S]{0,400}\.carril-head \.chevron/);
  });

  it('pero el botón sigue vivo, o un carril plegado quedaría trabado', () => {
    const anchas = ESTILOS.slice(ESTILOS.lastIndexOf('@media (min-width: 1080px)'));
    expect(anchas).not.toContain('pointer-events: none');
  });

  it('girar el teléfono cambia el modo sin recargar', () => {
    expect(SALON).toContain("addEventListener('change'");
    expect(SALON).toContain("removeEventListener('change'");
  });
});
