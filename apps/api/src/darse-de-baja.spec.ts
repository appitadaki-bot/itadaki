import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Darse de baja desde el panel.
 *
 * La landing lo promete —"te damos de baja cuando quieras, desde tu panel"— y
 * no existía: la única forma era escribirnos. Prometer una salida fácil y no
 * darla es peor que no prometerla, porque quien quiere irse y no puede lo
 * cuenta.
 *
 * Lo que se cuida acá es que la baja no corte el servicio de golpe, y que sólo
 * la pueda pedir quien paga.
 */

const CONTROLLER = readFileSync(join(__dirname, 'auth.controller.ts'), 'utf-8');
const LANDING = readFileSync(join(__dirname, '../../../apps/landing/index.html'), 'utf-8');

describe('lo que promete la landing existe', () => {
  it('la landing lo sigue prometiendo', () => {
    // Si algún día se saca de la landing, este test avisa que el endpoint
    // quedó sin dueño.
    expect(LANDING).toContain('Te damos de baja cuando quieras, desde tu panel');
  });

  it('y el panel tiene cómo hacerlo', () => {
    expect(CONTROLLER).toContain("@Post('darme-de-baja')");
  });
});

describe('quién puede darla de baja', () => {
  it('sólo el dueño', () => {
    // Es quien paga y quien recibe la factura. Un encargado con acceso al
    // panel no puede dar de baja el restaurante donde trabaja.
    const baja = CONTROLLER.slice(CONTROLLER.indexOf('async darmeDeBaja('));
    const cuerpo = baja.slice(0, baja.indexOf('\n  /**'));

    expect(cuerpo).toContain("auth.role !== 'OWNER'");
    expect(cuerpo).toContain('SOLO_EL_DUENO');
  });
});

describe('la baja no corta el servicio', () => {
  it('el endpoint no toca hasta cuándo está pagado', () => {
    // Cortar el día que alguien la pide sería quedarse con plata de un
    // servicio que no se dio, y dejar un salón sin sistema en medio del turno.
    const baja = CONTROLLER.slice(CONTROLLER.indexOf('async darmeDeBaja('));
    const cuerpo = baja.slice(0, baja.indexOf('\n  /**'));

    expect(cuerpo).not.toContain('paidUntil');
    expect(cuerpo).toContain('darDeBaja');
  });

  it('devuelve el estado nuevo', () => {
    // Para que el panel diga hasta cuándo tiene servicio sin volver a
    // preguntar.
    const baja = CONTROLLER.slice(CONTROLLER.indexOf('async darmeDeBaja('));
    const cuerpo = baja.slice(0, baja.indexOf('\n  /**'));

    expect(cuerpo).toContain('this.subscription(auth)');
  });
});

describe('volver atrás', () => {
  it('se puede reactivar', () => {
    // Quien se arrepiente a los tres días no tiene por qué volver a cargar la
    // carta, las mesas y el equipo.
    expect(CONTROLLER).toContain("@Post('reactivar')");
  });

  it('también sólo el dueño', () => {
    const reactivar = CONTROLLER.slice(CONTROLLER.indexOf('async reactivar('));
    const cuerpo = reactivar.slice(0, reactivar.indexOf('\n  /**'));

    expect(cuerpo).toContain("auth.role !== 'OWNER'");
  });
});
