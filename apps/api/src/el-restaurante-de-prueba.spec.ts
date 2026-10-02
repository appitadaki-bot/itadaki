import { ok } from '@itadaki/shared/domain';
import { TOPE_DE_DEMOS } from '@itadaki/identity/domain';
import { verifyToken } from '@itadaki/identity/infra';
import { AUTH_SECRET } from './auth';
import { type CatalogService } from './catalog.service';
import { DemoService } from './demo.service';

/**
 * El restaurante de prueba que se arma solo desde la landing.
 *
 * Lo que se prueba acá es el orden de las cosas, que es donde están los
 * errores caros: barrer antes de contar —si no, los muertos llenan el tope y
 * nadie puede probar la app— y no dejar un restaurante sin su fila de
 * vencimiento, que sería basura que nadie barre nunca.
 */

interface Llamada {
  readonly que: string;
  readonly cuando: number;
}

class DemoDePrueba extends DemoService {
  readonly llamadas: Llamada[] = [];
  vivos = 0;
  anotarFalla = false;
  barridos: Date[] = [];

  private paso = 0;

  private anotar(que: string): void {
    this.paso += 1;
    this.llamadas.push({ que, cuando: this.paso });
  }

  constructor() {
    // La carta no se toca acá: la siembra se reemplaza más abajo.
    super(null as unknown as CatalogService);

    this.demos = {
      anotar: async () => {
        this.anotar('anotar');
        return this.anotarFalla
          ? { isErr: () => true, isOk: () => false, error: { detail: 'falló' } }
          : ok(undefined);
      },
      cuantosViven: async () => {
        this.anotar('contar');
        return ok(this.vivos);
      },
      vencimientoDe: async () => ok(null),
      barrerVencidos: async (ahora: Date) => {
        this.anotar('barrer');
        this.barridos.push(ahora);
        return ok([]);
      },
    } as unknown as DemoService['demos'];

    this.tenants = {
      signUp: async () => {
        this.anotar('crear restaurante');
        return ok({ tenant: {}, owner: { id: 'el-dueño' } });
      },
    } as unknown as DemoService['tenants'];

    this.staff = {
      create: async () => ok({}),
      guardarPin: async () => ok(undefined),
    } as unknown as DemoService['staff'];

    this.tables = {
      save: async () => {
        this.anotar('crear mesa');
        return ok({ tenantId: 'x', id: 'mesa-1', label: 'Mesa 1', secret: 'abcdef' });
      },
    } as unknown as DemoService['tables'];

    this.sembrar = async () => {
      this.anotar('sembrar la carta');
    };
  }

  private orden(que: string): number {
    return this.llamadas.find((llamada) => llamada.que === que)?.cuando ?? -1;
  }

  pasoDe(que: string): number {
    return this.orden(que);
  }
}

describe('armar un restaurante de prueba', () => {
  const ahora = new Date('2026-10-01T20:00:00Z');

  it('devuelve la mesa y las tres cuentas', () => {
    // Tres y no una: lo que hay que mostrar es que las pantallas se hablan.
    return new DemoDePrueba().crear(ahora).then((hecho) => {
      expect(hecho.ok).toBe(true);
      if (!hecho.ok) return;

      expect(hecho.demo.tenantId).toMatch(/^demo-[a-z2-9]{10}$/);
      expect(hecho.demo.expiraEn.toISOString()).toBe('2026-10-01T22:00:00.000Z');
      expect(hecho.demo.tableToken.length).toBeGreaterThan(20);
      expect(hecho.demo.accesos.map((acceso) => acceso.rol)).toEqual([
        'OWNER',
        'KITCHEN',
        'CAJA',
      ]);
    });
  });

  it('barre antes de contar', async () => {
    // Si contara primero, los vencidos sin barrer llenarían el tope y nadie
    // podría probar la app hasta que pasara el reloj de los quince minutos.
    const servicio = new DemoDePrueba();
    await servicio.crear(ahora);

    expect(servicio.pasoDe('barrer')).toBeLessThan(servicio.pasoDe('contar'));
  });

  it('con el tope lleno no crea ninguno', async () => {
    const servicio = new DemoDePrueba();
    servicio.vivos = TOPE_DE_DEMOS;

    const hecho = await servicio.crear(ahora);

    expect(hecho.ok).toBe(false);
    if (hecho.ok) return;
    expect(hecho.error.kind).toBe('SIN_LUGAR');
    // Y no llegó a tocar nada del restaurante.
    expect(servicio.pasoDe('crear restaurante')).toBe(-1);
  });

  it('la carta se siembra antes de la mesa', async () => {
    // El visitante tiene que encontrar platos: una carta vacía no demuestra
    // nada, y es lo primero que se ve al escanear.
    const servicio = new DemoDePrueba();
    await servicio.crear(ahora);

    expect(servicio.pasoDe('sembrar la carta')).toBeGreaterThan(
      servicio.pasoDe('crear restaurante'),
    );
    expect(servicio.pasoDe('sembrar la carta')).toBeLessThan(servicio.pasoDe('crear mesa'));
  });

  it('si no se pudo anotar el vencimiento, no queda basura eterna', async () => {
    // Un restaurante sin fila en `demos` no lo barre nadie nunca.
    const servicio = new DemoDePrueba();
    servicio.anotarFalla = true;

    const hecho = await servicio.crear(ahora);

    expect(hecho.ok).toBe(false);
    // Dos barridos: el de entrada, y el que lo deshace.
    expect(servicio.barridos).toHaveLength(2);
    expect(servicio.barridos[1]?.getTime()).toBeGreaterThan(ahora.getTime());
  });
});

/**
 * Las llaves que el restaurante de prueba reparte.
 *
 * Es lo único del alta que deja entrar sin contraseña —el que llega desde
 * "Probar la app" no eligió ningún usuario— así que lo que importa probar es
 * que la llave abra lo que tiene que abrir y nada más.
 */
describe('las sesiones del restaurante de prueba', () => {
  const ahora = new Date('2026-10-01T20:00:00Z');

  it('el servidor reconoce la llave de cada pantalla', async () => {
    const hecho = await new DemoDePrueba().crear(ahora);
    if (!hecho.ok) throw new Error('no se creó el restaurante de prueba');

    for (const acceso of hecho.demo.accesos) {
      const abierto = verifyToken(acceso.token, AUTH_SECRET, ahora);
      expect(abierto).not.toBeNull();
      // El rol de esa pantalla y el restaurante recién creado: una llave que
      // abriera otro local sería justo lo que el aislamiento evita.
      expect(abierto?.role).toBe(acceso.rol);
      expect(abierto?.tenantId).toBe(hecho.demo.tenantId);
    }
  });

  it('la llave muere con el restaurante', async () => {
    const hecho = await new DemoDePrueba().crear(ahora);
    if (!hecho.ok) throw new Error('no se creó el restaurante de prueba');

    // Las dos horas de la demo, no las doce de una sesión de trabajo: cuando
    // ya no hay nada que mirar tampoco queda una llave dando vueltas.
    const vencida = new Date(hecho.demo.expiraEn.getTime() + 1);
    for (const acceso of hecho.demo.accesos) {
      expect(verifyToken(acceso.token, AUTH_SECRET, vencida)).toBeNull();
    }
  });

  it('firmada con otro secreto no vale', async () => {
    const hecho = await new DemoDePrueba().crear(ahora);
    if (!hecho.ok) throw new Error('no se creó el restaurante de prueba');

    for (const acceso of hecho.demo.accesos) {
      expect(verifyToken(acceso.token, 'otro-secreto-cualquiera', ahora)).toBeNull();
    }
  });
});
