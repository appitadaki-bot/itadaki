import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Qué dice el panel cuando la carta no tiene nada.
 *
 * "Cargando la carta…" servía para tres cosas distintas: que todavía no llegó,
 * que llegó vacía, y que la petición falló. El dueño que acaba de crear su
 * restaurante veía "cargando" para siempre sobre una carta que no tiene nada
 * —esperando algo que nunca iba a aparecer— en vez de entender que le toca
 * cargarla a él.
 *
 * Y si la petición fallaba, la pantalla se quedaba igual: el fallo no dejaba
 * rastro y parecía una carta que tarda mucho.
 */

const PANEL = readFileSync(join(__dirname, 'admin.component.ts'), 'utf-8');

describe('los tres estados de la carta', () => {
  it('están separados', () => {
    expect(PANEL).toContain("signal<'cargando' | 'lista' | 'falló'>");
  });

  it('la carta vacía invita a cargar algo', () => {
    // Es lo primero que ve un dueño nuevo: tiene que entender que le toca a él.
    expect(PANEL).toContain('Todavía no cargaste ningún plato');
  });

  it('explica por dónde empezar', () => {
    // Sin esto queda un cartel que dice que falta algo pero no qué hacer.
    expect(PANEL).toMatch(/Empezá por una categoría/);
  });

  it('un fallo se dice y deja reintentar', () => {
    expect(PANEL).toContain('No pudimos traer la carta');
    expect(PANEL).toContain('reintentarCarta()');
  });
});

describe('cuándo cambia de estado', () => {
  it('pasa a lista cuando la carta llegó', () => {
    const load = PANEL.slice(PANEL.indexOf('private async load()'));
    const cuerpo = load.slice(0, load.indexOf('\n  }'));

    expect(cuerpo).toContain("this.cartaEstado.set('lista')");
  });

  it('pasa a falló cuando la petición no salió', () => {
    // Antes era un `return` pelado y la pantalla se quedaba en "cargando".
    const load = PANEL.slice(PANEL.indexOf('private async load()'));
    const cuerpo = load.slice(0, load.indexOf('\n  }'));

    expect(cuerpo).toContain("this.cartaEstado.set('falló')");
  });

  it('reintentar vuelve a cargando', () => {
    // Sin esto el botón dejaría el mensaje de error mientras pide de nuevo.
    const metodo = PANEL.slice(PANEL.indexOf('protected reintentarCarta()'));
    expect(metodo.slice(0, metodo.indexOf('\n  }'))).toContain("set('cargando')");
  });

  it('arranca en cargando', () => {
    // Al abrir el panel la carta todavía no llegó: mostrar "no cargaste nada"
    // en ese momento sería mentirle a quien sí tiene platos.
    expect(PANEL).toMatch(/cartaEstado = signal<[^>]+>\('cargando'\)/);
  });
});
