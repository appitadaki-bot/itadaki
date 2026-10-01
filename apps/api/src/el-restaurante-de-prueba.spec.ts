import { ok } from '@itadaki/shared/domain';
import { TOPE_DE_DEMOS } from '@itadaki/identity/domain';
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
    super();

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
        return ok({ tenant: {}, owner: {} });
      },
    } as unknown as DemoService['tenants'];

    this.staff = {
      create: async () => ok({}),
      guardarPin: async () => ok(undefined),
    } as unknown as DemoService['staff'];

    this.tables = {
      save: async () => {
        this.anotar('crear mesa');
        return ok({ tenantId: 'x', id: 'mesa-1', label: 'Mesa 1', seats: 4, secret: 'abcdef' });
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
