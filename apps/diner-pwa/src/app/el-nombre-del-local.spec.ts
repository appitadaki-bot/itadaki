import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A quién saluda la pantalla de bienvenida.
 *
 * Decía "Bienvenido a ITADAKI". El comensal escaneó el QR de una mesa en un
 * restaurante: entró a ese lugar, no a un sistema, y saludarlo con nuestra
 * marca le habla de algo que no eligió ver ni le importa.
 *
 * Después el nombre del local estaba, pero adentro de una frase —"Bienvenido
 * a X. Tu mesa ya está lista"— mientras el título grande lo seguía ocupando
 * "Itadakimasu!", que es nuestro y no suyo. Ahora el nombre es el título.
 *
 * Es lo primero que ve de la app, y la única pantalla donde el restaurante
 * puede parecer suyo.
 */

const PANTALLA = readFileSync(join(__dirname, 'welcome.page.ts'), 'utf-8').replace(/\r\n/g, "\n");

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

  it('un fallo al pedirlo no muestra ningún error', () => {
    // Es lo primero que se ve: no es lugar para contarle un problema a nadie,
    // y sin nombre la pantalla funciona igual.
    const carga = PANTALLA.slice(PANTALLA.indexOf('private async cargarNombre'));
    const cuerpo = carga.slice(0, carga.indexOf('\n  }'));

    expect(cuerpo).toContain('catch');
    expect(cuerpo).not.toContain('error.set');
  });
});
