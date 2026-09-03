import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Cambiarle el encuadre a una foto que ya está subida.
 *
 * Estaba roto de dos maneras a la vez, y ninguna avisaba.
 *
 * El editor se guardaba el archivo elegido y no emitía nada sin él, así que
 * quien abría una foto ya subida y movía el recorte tocaba "Aplicar" y no
 * pasaba absolutamente nada: ni un pedido al servidor, ni un error. Se
 * intentaba de nuevo creyendo haber errado el botón.
 *
 * Y aunque hubiera llegado: los archivos se sirven con un año de caché e
 * `immutable`, y las variantes se escriben en la misma ruta. Sin nada que
 * distinga la URL, el navegador que ya vio la foto vieja no vuelve a
 * preguntar nunca.
 */

const PANEL = readFileSync(join(__dirname, 'admin.component.ts'), 'utf-8').replace(/\r\n/g, "\n");
const EDITOR = readFileSync(
  join(__dirname, '../../../../libs/shared/ui-image-editor/src/lib/image-editor.component.ts'),
  'utf-8',
);
const STORE = readFileSync(
  join(__dirname, '../../../../libs/catalog/infra/src/lib/local-image-store.ts'),
  'utf-8',
);

describe('el editor avisa aunque no haya archivo nuevo', () => {
  it('no se calla cuando el archivo es null', () => {
    // El `return` silencioso es lo que se comía las tres ediciones seguidas.
    const emit = EDITOR.slice(EDITOR.indexOf('protected emit()'));
    const cuerpo = emit.slice(0, emit.indexOf('\n  }'));

    expect(cuerpo).not.toContain('if (this.file === null) return;');
  });

  it('el evento admite venir sin archivo', () => {
    expect(EDITOR).toContain('file: File | null');
  });
});

describe('el panel reencuadra en vez de resubir', () => {
  it('llama a reedit cuando no hay archivo', () => {
    // El original vive en el servidor: remandarlo serían varios megas por un
    // cambio de coordenadas, y el dueño no tiene el archivo a mano.
    expect(PANEL).toContain('/reedit');
  });

  it('sigue subiendo el original cuando sí hay archivo', () => {
    expect(PANEL).toContain('subirElOriginal');
  });

  it('elige uno u otro según el archivo', () => {
    expect(PANEL).toMatch(/event\.file === null[\s\S]{0,200}reedit/);
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
