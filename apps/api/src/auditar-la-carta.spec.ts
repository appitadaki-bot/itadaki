import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Que todo cambio en la carta quede registrado.
 *
 * Había una tabla `price_audit` con su implementación y su puerto, y nadie la
 * llamaba: estaba vacía. Los endpoints ni siquiera pedían la sesión, así que
 * el dato de quién hacía el cambio no llegaba a ninguna parte.
 *
 * Importa desde que soporte puede escribir en la carta de cualquier
 * restaurante: el argumento para dárselo fue que quedara registrado quién
 * hizo qué.
 */
const MENU = readFileSync(join(__dirname, 'menu.controller.ts'), 'utf-8');

/** Las rutas que cambian la carta, y qué debería anotar cada una. */
const QUE_CAMBIA_LA_CARTA = [
  'createProduct',
  'updateProduct',
  'deleteProduct',
  'setAvailability',
  'createCategory',
  'deleteCategory',
  'importMenu',
] as const;

describe('auditar la carta', () => {
  it.each(QUE_CAMBIA_LA_CARTA)('%s deja registro', (metodo) => {
    const inicio = MENU.indexOf(`async ${metodo}(`);
    expect(inicio).toBeGreaterThan(-1);

    // Hasta el siguiente método: el cuerpo entero, sin invadir el que sigue.
    const siguiente = MENU.indexOf('\n  @', inicio);
    const cuerpo = MENU.slice(inicio, siguiente === -1 ? undefined : siguiente);

    expect(cuerpo).toContain('this.anotar(');
  });

  it.each(QUE_CAMBIA_LA_CARTA)('%s sabe quién lo hizo', (metodo) => {
    const inicio = MENU.indexOf(`async ${metodo}(`);
    const cuerpo = MENU.slice(inicio, inicio + 600);

    expect(cuerpo).toContain('@Auth() auth: AuthContext');
  });

  /**
   * Un fallo al registrar no puede voltear el cambio: el plato ya se guardó,
   * y dejar al dueño sin poder cambiar un precio porque la auditoría tuvo un
   * problema es peor que perder una línea de bitácora.
   */
  it('anotar no espera ni rompe la operación', () => {
    const donde = MENU.indexOf('private anotar(');
    const cuerpo = MENU.slice(donde, donde + 500);

    expect(cuerpo).toContain('void this.catalog.bitacora?.registrar');
  });

  /** El rol se guarda: saber que fue soporte y no el dueño es el punto. */
  it('registra el rol de quien hizo el cambio', () => {
    const donde = MENU.indexOf('private anotar(');
    expect(MENU.slice(donde, donde + 500)).toContain('rol: auth.role');
  });

  it('y se puede leer desde el panel', () => {
    expect(MENU).toContain("@Get('bitacora')");
  });
});

describe('traer mi carta', () => {
  const PANEL = readFileSync(
    join(process.cwd(), 'apps/admin-web/src/app/admin.component.ts'),
    'utf-8',
  );

  /**
   * El botón pedía pegar la carta en un formato que hay que entender, y el
   * dueño llegaba sin saber qué esperaba el campo. Hoy se la cargamos
   * nosotros desde soporte antes de darle la cuenta.
   */
  it('ya no se ofrece en el panel', () => {
    expect(PANEL).not.toContain('>\n              Traer mi carta\n            </button>');
  });

  /** El importador sigue vivo: lo usa el alta. */
  it('pero el importador sigue existiendo', () => {
    expect(MENU).toContain("@Post('import')");
  });
});
