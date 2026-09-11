import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * El alta de una cuenta es por WhatsApp, y sólo por ahí.
 *
 * Había un formulario al lado del chat. Dos caminos para lo mismo obligaban a
 * elegir antes de haber hablado con nadie, y del otro lado alguien tenía que
 * mirar dos lugares para no perder a un interesado.
 */
const LANDING = join(__dirname, '..', '..', 'landing');
const HTML = readFileSync(join(LANDING, 'index.html'), 'utf-8').replace(/\r\n/g, '\n');
const JS = readFileSync(join(LANDING, 'landing.js'), 'utf-8').replace(/\r\n/g, '\n');

/** Cada enlace `<a ...>` de la página, entero. */
const enlaces = [...HTML.matchAll(/<a\b[^>]*>/g)].map(([etiqueta]) => etiqueta);

describe('un solo canal para darse de alta', () => {
  it('no hay formulario', () => {
    expect(HTML).not.toContain('<form');
  });

  it('el script ya no manda datos a ningún lado', () => {
    expect(JS).not.toContain('/api/interesados');
    expect(JS).not.toContain("getElementById('form')");
  });

  it('"Probar 30 días gratis" abre el chat, arriba y en el hero', () => {
    const probar = [...HTML.matchAll(/<a\b[^>]*>\s*Probar 30 días gratis\s*<\/a>/g)];

    expect(probar.length).toBeGreaterThanOrEqual(2);
    for (const [boton] of probar) {
      expect(boton).toContain('data-wa=');
      expect(boton).toContain('href="https://wa.me/');
    }
  });

  it('ningún enlace apunta al formulario que ya no está', () => {
    expect(enlaces.filter((enlace) => enlace.includes('href="#alta"'))).toEqual([]);
  });

  /*
   * El mensaje lo suma el script. Si no corre —un teléfono viejo, un bloqueador
   * que se lo come—, el `href` que ya trae el HTML tiene que llevar igual al
   * chat, aunque sea sin el texto escrito.
   */
  it('sin el script, cada botón de WhatsApp sigue llevando al chat', () => {
    const deWhatsApp = enlaces.filter((enlace) => enlace.includes('data-wa='));

    expect(deWhatsApp.length).toBeGreaterThan(0);
    for (const enlace of deWhatsApp) {
      expect(enlace).toContain('href="https://wa.me/');
    }
  });
});
