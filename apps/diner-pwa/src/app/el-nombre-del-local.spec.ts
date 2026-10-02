import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Dónde aparece el nombre del restaurante, y de dónde sale.
 *
 * La bienvenida decía "Bienvenido a ITADAKI". El comensal escaneó el QR de una
 * mesa en un restaurante: entró a ese lugar, no a un sistema, y saludarlo con
 * nuestra marca le habla de algo que no eligió ver ni le importa.
 *
 * Después el nombre del local estaba, pero adentro de una frase —"Bienvenido
 * a X. Tu mesa ya está lista"— mientras el título grande lo seguía ocupando
 * "Itadakimasu!", que es nuestro y no suyo. Ahora el nombre es el título.
 *
 * Son las dos pantallas donde el restaurante puede parecer suyo: la primera
 * que ve, y la carta.
 */

const leer = (archivo: string): string =>
  readFileSync(join(__dirname, archivo), 'utf-8').replace(/\r\n/g, '\n');

const PANTALLA = leer('welcome.page.ts');
const CARTA = leer('menu.page.ts');
const STORE = leer('local.store.ts');

describe('el saludo', () => {
  it('el nombre del restaurante es el título', () => {
    // En un `<h1>` y no en una frase: es lo que tiene que leerse primero.
    expect(PANTALLA).toContain('<h1 class="local">{{ local }}</h1>');
  });

  it('el saludo no le compite el título al local', () => {
    // "Itadakimasu!" es nuestro. Cuando hay nombre, baja a renglón de apoyo.
    const conNombre = PANTALLA.slice(
      PANTALLA.indexOf('@if (nombre(); as local)'),
      PANTALLA.indexOf('} @else {', PANTALLA.indexOf('@if (nombre(); as local)')),
    );
    expect(conNombre).toContain('<p class="saludo">Itadakimasu!</p>');
    expect(conNombre).not.toContain('<h1 class="greeting">');
  });

  it('ya no nombra la marca', () => {
    expect(PANTALLA).not.toContain('Bienvenido a ITADAKI');
  });

  it('sin nombre, el saludo vuelve a ser el título', () => {
    // Quien abre la app sin escanear no tiene local que nombrar. Sin esto la
    // pantalla se quedaba sin título, que se ve rota y no vacía.
    const sinNombre = PANTALLA.slice(PANTALLA.indexOf('} @else {'));
    expect(sinNombre).toContain('<h1 class="greeting">Itadakimasu!</h1>');
    expect(PANTALLA).toContain('Tu mesa ya está lista');
  });

  it('el botón dice Ingresar', () => {
    // "Ver la carta" prometía menos de lo que hay del otro lado: ahí se pide,
    // se sigue el pedido y se paga.
    expect(PANTALLA).toContain('Ingresar');
    expect(PANTALLA).not.toContain('Ver la carta');
  });
});

describe('la carta', () => {
  it('el nombre del restaurante es el título', () => {
    // Igual que en la bienvenida: el comensal está en un restaurante, y lo
    // que ve es la carta de ese lugar.
    expect(CARTA).toContain('<h1 class="title">{{ nombre }}</h1>');
  });

  it('"Nuestra carta" baja a renglón de apoyo', () => {
    const conNombre = CARTA.slice(
      CARTA.indexOf('@if (local.nombre(); as nombre)'),
      CARTA.indexOf('} @else {', CARTA.indexOf('@if (local.nombre(); as nombre)')),
    );
    expect(conNombre).toContain('<p class="head-eyebrow">Nuestra carta</p>');
  });

  it('sin nombre, "Nuestra carta" vuelve a ser el título', () => {
    // Quien abre la app sin escanear no tiene local que nombrar. Una pantalla
    // sin título se ve rota, no vacía.
    const sinNombre = CARTA.slice(CARTA.indexOf('@if (local.nombre(); as nombre)'));
    expect(sinNombre).toContain('<h1 class="title">Nuestra carta</h1>');
  });
});

describe('de dónde sale el nombre', () => {
  it('se pide una sola vez por visita', () => {
    // Lo quieren dos pantallas. Pidiéndolo cada una por su cuenta son dos
    // viajes contra una API que en el plan gratis puede estar despertándose.
    expect(STORE).toContain('this.pedido ??= this.pedir()');
  });

  it('un fallo no muestra ningún error', () => {
    // La bienvenida es lo primero que se ve y la carta es lo que se vino a
    // mirar: ninguna de las dos es lugar para contarle un problema a nadie, y
    // sin nombre las dos funcionan igual.
    const carga = STORE.slice(STORE.indexOf('private async pedir'));
    const cuerpo = carga.slice(0, carga.indexOf('\n  }'));

    expect(cuerpo).toContain('catch');
    expect(cuerpo).not.toContain('error.set');
  });
});
