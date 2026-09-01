import { empiezaElDia, zonaValida } from './el-dia-del-local';

/**
 * Desde cuándo cuenta "hoy" para un restaurante.
 *
 * No son las últimas veinticuatro horas. Un mozo que mira las métricas un
 * martes a las nueve de la noche quiere ver el servicio de hoy, y las últimas
 * veinticuatro le meterían adentro la noche del lunes — que fue otro turno,
 * con otra caja y otro cierre.
 *
 * Y el día es el del local, no el del servidor: la API corre en Oregon y el
 * restaurante está en San Juan.
 */

const ARGENTINA = 'America/Argentina/Buenos_Aires';

describe('cuándo empieza el día del restaurante', () => {
  it('a la medianoche de allá, no de acá', () => {
    // 23:30 UTC es 20:30 en Argentina: el día empezó a las 03:00 UTC.
    const ahora = new Date('2026-09-02T23:30:00Z');

    expect(empiezaElDia(ahora, ARGENTINA).toISOString()).toBe('2026-09-02T03:00:00.000Z');
  });

  it('a la mañana temprano sigue siendo el mismo día', () => {
    // 13:00 UTC son las 10:00 de la mañana allá.
    const ahora = new Date('2026-09-02T13:00:00Z');

    expect(empiezaElDia(ahora, ARGENTINA).toISOString()).toBe('2026-09-02T03:00:00.000Z');
  });

  it('después de medianoche local, ya es otro día', () => {
    // 04:00 UTC es la 01:00 del día 3 en Argentina: el servicio de la noche
    // del 2 ya quedó en el día anterior, que es como lo cuenta el local.
    const ahora = new Date('2026-09-03T04:00:00Z');

    expect(empiezaElDia(ahora, ARGENTINA).toISOString()).toBe('2026-09-03T03:00:00.000Z');
  });

  it('no son las últimas veinticuatro horas', () => {
    // El caso que motiva todo esto: a las 20:30, 24 horas atrás incluiría el
    // servicio de anoche.
    const ahora = new Date('2026-09-02T23:30:00Z');
    const inicio = empiezaElDia(ahora, ARGENTINA);
    const hace24 = new Date(ahora.getTime() - 86_400_000);

    expect(inicio.getTime()).toBeGreaterThan(hace24.getTime());
  });

  it('el corte queda en punto', () => {
    // Sin milisegundos sueltos: un pedido de las 00:00:00.500 tiene que
    // contar como del día que empieza.
    const inicio = empiezaElDia(new Date('2026-09-02T23:30:45.123Z'), ARGENTINA);

    expect(inicio.getMilliseconds()).toBe(0);
    expect(inicio.getSeconds()).toBe(0);
  });

  it('sirve en otra zona', () => {
    // Un local en México no puede depender de que la zona sea la nuestra.
    const ahora = new Date('2026-09-02T23:30:00Z');
    const inicio = empiezaElDia(ahora, 'America/Mexico_City');

    expect(inicio.getTime()).toBeLessThan(ahora.getTime());
    expect(ahora.getTime() - inicio.getTime()).toBeLessThan(86_400_000);
  });
});

describe('una zona que no existe', () => {
  it('se puede detectar antes de usarla', () => {
    // Un dato de configuración roto no puede tumbar las métricas enteras.
    expect(zonaValida('America/Argentina/Buenos_Aires')).toBe(true);
    expect(zonaValida('Marte/Olympus')).toBe(false);
  });
});
