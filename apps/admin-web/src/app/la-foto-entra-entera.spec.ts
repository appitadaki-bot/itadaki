import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La foto del plato no se recorta.
 *
 * El editor abría con la foto ya cortada —un cuadrado contra el lado corto—
 * y ofrecía arrastrarla: lo único que se elegía era qué mitad del plato se
 * perdía. Ahora entra entera y el servidor rellena lo que le falta al
 * cuadrado, así que no hay nada que encuadrar.
 *
 * El original se sigue guardando: es lo que permite volver a generar las
 * variantes sin pedirle la foto de nuevo al restaurante.
 */

const PANEL = readFileSync(join(__dirname, 'admin.component.ts'), 'utf-8').replace(/\r\n/g, '\n');
const EDITOR = readFileSync(
  join(__dirname, '../../../../libs/shared/ui-image-editor/src/lib/image-editor.component.ts'),
  'utf-8',
);
const ESTILOS = readFileSync(
  join(__dirname, '../../../../libs/shared/ui-image-editor/src/lib/image-editor.component.css'),
  'utf-8',
);
const STORE = readFileSync(
  join(__dirname, '../../../../libs/catalog/infra/src/lib/local-image-store.ts'),
  'utf-8',
);

describe('el editor muestra la foto entera', () => {
  it('la vista previa no recorta', () => {
    // `cover` es lo que la cortaba: mostraba el centro y comía los bordes.
    expect(ESTILOS).toContain('object-fit: contain;');
    expect(ESTILOS).not.toContain('object-fit: cover;');
  });

  it('no quedó ningún control de encuadre', () => {
    // Arrastrar, hacer zoom y la grilla de tercios existían sólo para elegir
    // el recorte.
    for (const resto of ['pointerdown', 'onWheel', 'panLimits', 'class="grid"', 'Restablecer']) {
      expect(EDITOR).not.toContain(resto);
    }
  });

  it('emite el archivo y nada más', () => {
    expect(EDITOR).toContain('readonly applied = output<{ file: File }>();');
  });
});

describe('el panel sube el original', () => {
  it('manda el archivo tal cual, no un canvas', () => {
    // El servidor renderiza desde el original: una copia rasterizada por el
    // navegador llegaría con menos calidad de la que se subió.
    expect(PANEL).toContain('subirElOriginal');
    expect(PANEL).toContain('data: btoa(binary)');
  });

  it('ya no manda parámetros de recorte', () => {
    expect(PANEL).not.toContain('ImageEditParams');
    expect(PANEL).not.toContain('event.params');
  });
});

describe('la URL cambia cuando la foto cambia', () => {
  it('las variantes llevan una marca de versión', () => {
    // Sin esto el navegador sirve la vieja para siempre: un año de caché,
    // `immutable`, y la misma ruta.
    expect(STORE).toContain('v=${version}');
  });

  it('la versión se calcula al renderizar', () => {
    // En el servidor y no en cada pantalla: así la lleva la carta, el panel y
    // cualquier otra que lea esas URLs, y sobrevive a recargar la página.
    expect(STORE).toMatch(/const version = Date\.now\(\)/);
  });

  it('el tenant sigue viajando en la query', () => {
    // La ruta que sirve los archivos lo espera ahí; perderlo daría 404.
    expect(STORE).toContain('tenant=${tenantId}');
  });
});
