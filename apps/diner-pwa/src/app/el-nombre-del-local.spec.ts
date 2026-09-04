import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A quién saluda la pantalla de bienvenida.
 *
 * Decía "Bienvenido a ITADAKI". El comensal escaneó el QR de una mesa en un
 * restaurante: entró a ese lugar, no a un sistema, y saludarlo con nuestra
 * marca le habla de algo que no eligió ver ni le importa.
 *
 * Es además lo primero que ve de la app, y la única pantalla donde el
 * restaurante puede parecer suyo.
 */

const PANTALLA = readFileSync(join(__dirname, 'welcome.page.ts'), 'utf-8').replace(/\r\n/g, "\n");

describe('el saludo', () => {
  it('usa el nombre del restaurante', () => {
    expect(PANTALLA).toContain('Bienvenido a {{ local }}');
  });

  it('ya no nombra la marca', () => {
    expect(PANTALLA).not.toContain('Bienvenido a ITADAKI');
  });

  it('sin nombre, saluda igual', () => {
    // Quien abre la app sin escanear no tiene local: la pantalla no puede
    // quedar con un hueco ni con un cartel de error.
    const sinNombre = PANTALLA.slice(PANTALLA.indexOf('@else'));
    expect(sinNombre).toContain('Tu mesa ya está lista');
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
