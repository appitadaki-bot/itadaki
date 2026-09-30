import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Lo que alguien escribió en el formulario de registro no se pierde.
 *
 * Dos fallas se sumaban y se hacían una sola. El modal se cerraba con
 * cualquier `click` cuyo destino fuera el `<dialog>`, y al seleccionar una
 * palabra el botón se suelta donde quedó el puntero: si eso caía sobre el
 * borde, el navegador reportaba el click en el fondo y el formulario se
 * cerraba en medio de escribirlo. Y al volver a abrirlo se hacía `reset()`,
 * así que lo escrito ya no estaba.
 *
 * Alguien que perdió su nombre, su restaurante, su dirección y su correo por
 * un clic mal puesto no los escribe de nuevo: cierra la pestaña. Es el
 * formulario del que dependen las altas.
 */
const LANDING = join(__dirname, '..', '..', 'landing');
const JS = readFileSync(join(LANDING, 'landing.js'), 'utf-8').replace(/\r\n/g, '\n');

describe('el modal de registro', () => {
  it('sólo se cierra si el gesto empezó en el fondo', () => {
    // Mirar dónde terminó el clic no alcanza: arrastrar desde adentro para
    // seleccionar texto termina sobre el fondo todo el tiempo.
    expect(JS).toContain("modalRegistro?.addEventListener('mousedown'");
    expect(JS).toContain('empezoEnElFondo');

    const alClic = JS.slice(JS.indexOf("modalRegistro?.addEventListener('click'"));
    expect(alClic.slice(0, alClic.indexOf('});'))).toContain('empezoEnElFondo &&');
  });

  it('y sigue cerrándose al tocar el fondo de verdad', () => {
    const alClic = JS.slice(JS.indexOf("modalRegistro?.addEventListener('click'"));
    expect(alClic.slice(0, alClic.indexOf('});'))).toContain('modalRegistro.close()');
  });
});

describe('lo escrito', () => {
  it('no se borra al abrir el modal', () => {
    const alAbrir = JS.slice(JS.indexOf('data-abrir-registro'));
    const cuerpo = alAbrir.slice(0, alAbrir.indexOf('botonCerrarModal'));

    expect(cuerpo).not.toContain('formRegistro?.reset()');
    expect(cuerpo).toContain('showModal()');
  });

  it('pero sí al enviarlo, que es cuando ya no hace falta', () => {
    // Si no, el próximo que abra la página encuentra los datos del anterior.
    expect(JS).toContain('formRegistro.reset()');
  });
});
