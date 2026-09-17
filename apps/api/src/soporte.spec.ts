import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { can, esDeSoporte, permissionsOf } from '@itadaki/identity/domain';

/**
 * La cuenta con la que entramos a armarle la carta a un local nuevo.
 *
 * Es una llave maestra, así que lo que importa no es que funcione sino lo
 * que NO puede hacer.
 */
const CONTROLLER = readFileSync(join(__dirname, 'auth.controller.ts'), 'utf-8');
const STAFF = readFileSync(join(__dirname, 'staff.controller.ts'), 'utf-8');

describe('qué puede soporte', () => {
  it('la carta, que es para lo que existe', () => {
    expect(can('SOPORTE', 'menu:read')).toBe(true);
    expect(can('SOPORTE', 'menu:write')).toBe(true);
  });

  /** Si la cuenta se filtra, lo peor posible es una carta mal cargada. */
  it('no ve la plata', () => {
    expect(can('SOPORTE', 'metrics:read')).toBe(false);
    expect(can('SOPORTE', 'bills:read')).toBe(false);
    expect(can('SOPORTE', 'bills:close')).toBe(false);
  });

  it('no toca al personal', () => {
    expect(can('SOPORTE', 'staff:manage')).toBe(false);
  });

  it('no mueve pedidos', () => {
    expect(can('SOPORTE', 'orders:advance')).toBe(false);
  });

  it('son sólo dos permisos', () => {
    expect([...permissionsOf('SOPORTE')].sort()).toEqual(['menu:read', 'menu:write']);
  });
});

describe('cómo se entra como soporte', () => {
  /**
   * El token vale para un restaurante y no para todos: el tenant sale del
   * token firmado, y eso es lo que impide leer otro local editando la URL.
   */
  it('el token se emite para el local que se pidió', () => {
    const donde = CONTROLLER.indexOf('async entrarComoSoporte');
    const cuerpo = CONTROLLER.slice(donde, donde + 3000);
    expect(cuerpo).toContain('tenantId: parsed.data.local');
  });

  /** Contestar distinto diría qué cuentas son de soporte. */
  it('un rol que no es soporte responde igual que una clave mala', () => {
    const donde = CONTROLLER.indexOf('async entrarComoSoporte');
    const cuerpo = CONTROLLER.slice(donde, donde + 3000);
    expect(cuerpo).toContain('!acerto || !esDeSoporte(quien.value.role)');
  });

  /** Es una llave maestra: su uso tiene que poder auditarse. */
  it('queda registrado a qué local entró', () => {
    const donde = CONTROLLER.indexOf('async entrarComoSoporte');
    expect(CONTROLLER.slice(donde, donde + 3000)).toContain(
      "log.info('soporte entró a un restaurante'",
    );
  });

  /**
   * Que el dueño pudiera crearse una cuenta de soporte sería darle acceso a
   * los demás restaurantes.
   */
  it('el panel del dueño no la ofrece', () => {
    expect(STAFF).toContain("role !== 'OWNER' && !esDeSoporte(role)");
  });

  it('ni el alta de personal la acepta', () => {
    expect(STAFF).toContain("z.enum(['MANAGER', 'KITCHEN', 'WAITER'])");
  });

  it('esDeSoporte reconoce sólo ese rol', () => {
    expect(esDeSoporte('SOPORTE')).toBe(true);
    expect(esDeSoporte('OWNER')).toBe(false);
    expect(esDeSoporte('MANAGER')).toBe(false);
  });
});

describe('la pantalla para elegir restaurante', () => {
  const LOGIN = readFileSync(
    join(process.cwd(), 'libs/shared/ui-auth/src/lib/login.component.ts'),
    'utf-8',
  );

  it('existe y se llega desde el login', () => {
    expect(LOGIN).toContain("mode() === 'soporte'");
    expect(LOGIN).toContain('Entrar como soporte');
  });

  /**
   * Sólo donde se registra un restaurante. En las apps del salón y la cocina
   * no tiene sentido y sería una puerta de más a la vista.
   */
  it('no aparece en las apps del personal', () => {
    const donde = LOGIN.indexOf('Entrar como soporte');
    expect(LOGIN.slice(donde - 400, donde)).toContain('allowSignUp()');
  });

  /** La lista de clientes no puede salir de tener una pestaña abierta. */
  it('el listado exige la contraseña', () => {
    expect(CONTROLLER).toContain("@Post('soporte/locales')");
    const donde = CONTROLLER.indexOf('async localesParaSoporte');
    const cuerpo = CONTROLLER.slice(donde, donde + 2000);
    expect(cuerpo).toContain('verifyPassword');
    expect(cuerpo).toContain('esDeSoporte');
  });

  /** El local de soporte no es un restaurante: no va en la lista. */
  it('no se lista a sí mismo', () => {
    const donde = CONTROLLER.indexOf('async localesParaSoporte');
    expect(CONTROLLER.slice(donde, donde + 2000)).toContain('!== TENANT_DE_SOPORTE');
  });
});

/**
 * El cupo de soporte no es el del login.
 *
 * Atender cinco consultas seguidas son diez pedidos —uno para buscar y otro
 * para entrar, por cada local— y con el cupo del login quedábamos trabados a
 * media tarde con "Demasiados intentos". Pasó de verdad, probando.
 */
describe('cuántas veces puede entrar soporte', () => {
  it('tiene su propio cupo, más ancho que el del login', () => {
    const limites = readFileSync(join(__dirname, 'rate-limit.guard.ts'), 'utf-8');
    expect(limites).toContain('soporte: { limit: 60');

    const login = /login: \{ limit: (\d+)/.exec(limites)?.[1];
    const soporte = /soporte: \{ limit: (\d+)/.exec(limites)?.[1];
    expect(Number(soporte)).toBeGreaterThan(Number(login));
  });

  it('y los dos endpoints lo usan', () => {
    const usos = CONTROLLER.match(/@RateLimit\('soporte'\)/g) ?? [];
    expect(usos).toHaveLength(2);
  });
});
