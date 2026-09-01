import { hayQueReleerLaCuenta } from './releer-la-cuenta';

describe('releer la cuenta cuando la mesa cambia', () => {
  /** El caso que estaba roto: el mozo cobró y la pantalla no se enteraba. */
  it('la relee mientras está abierta', () => {
    expect(hayQueReleerLaCuenta('mesa-1', 'OPEN')).toBe(true);
  });

  it('la relee aunque todavía no se haya leído ninguna', () => {
    expect(hayQueReleerLaCuenta('mesa-1', undefined)).toBe(true);
  });

  /** Ya cobrada no cambia más. */
  it('no la pide de nuevo una vez cerrada', () => {
    expect(hayQueReleerLaCuenta('mesa-1', 'SETTLED')).toBe(false);
  });

  it('no pide nada sin mesa', () => {
    expect(hayQueReleerLaCuenta(undefined, 'OPEN')).toBe(false);
  });
});
