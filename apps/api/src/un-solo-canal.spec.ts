import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * El alta de una cuenta termina siempre en WhatsApp, y sólo ahí.
 *
 * Hubo una época con un formulario al lado del chat, sin conectar con nada:
 * dos caminos para lo mismo obligaban a elegir antes de haber hablado con
 * nadie. El formulario volvió, pero como un paso previo que junta nombre,
 * restaurante, dirección y correo, y los manda al mismo chat — no hay un
 * backend nuevo recibiendo esos datos por otro lado, y sigue habiendo un
 * único formulario en toda la página.
 */
const LANDING = join(__dirname, '..', '..', 'landing');
const HTML = readFileSync(join(LANDING, 'index.html'), 'utf-8').replace(/\r\n/g, '\n');
const JS = readFileSync(join(LANDING, 'landing.js'), 'utf-8').replace(/\r\n/g, '\n');

/** Cada enlace `<a ...>` de la página, entero. */
const enlaces = [...HTML.matchAll(/<a\b[^>]*>/g)].map(([etiqueta]) => etiqueta);

describe('un solo canal para darse de alta', () => {
  it('hay un único formulario: el del modal de registro', () => {
    const formularios = HTML.match(/<form\b/g) ?? [];
    expect(formularios.length).toBe(1);
  });

  it('el formulario no manda datos a ningún backend propio', () => {
    expect(JS).not.toContain('/api/interesados');
    expect(JS).not.toContain("getElementById('form')");
    expect(JS).not.toMatch(/fetch\(|XMLHttpRequest/);
  });

  it('"Probar 30 días gratis" abre el formulario, arriba y en el hero', () => {
    const probar = [
      ...HTML.matchAll(/<button\b[^>]*data-abrir-registro[^>]*>\s*Probar 30 días gratis\s*<\/button>/g),
    ];

    expect(probar.length).toBeGreaterThanOrEqual(2);
  });

  it('el formulario termina abriendo WhatsApp, no otro destino', () => {
    expect(JS).toMatch(/wa\.me\/\$\{WHATSAPP\}/);
  });

  it('ningún enlace apunta al formulario que ya no está', () => {
    expect(enlaces.filter((enlace) => enlace.includes('href="#alta"'))).toEqual([]);
  });

  /*
   * El mensaje lo suma el script. Si no corre —un teléfono viejo, un bloqueador
   * que se lo come—, el `href` que ya trae el HTML tiene que llevar igual al
   * chat, aunque sea sin el texto escrito.
   */
  it('sin el script, cada botón de WhatsApp directo sigue llevando al chat', () => {
    const deWhatsApp = enlaces.filter((enlace) => enlace.includes('data-wa='));

    expect(deWhatsApp.length).toBeGreaterThan(0);
    for (const enlace of deWhatsApp) {
      expect(enlace).toContain('href="https://wa.me/');
    }
  });
});
