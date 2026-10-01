import {
  HORAS_DE_DEMO,
  PREFIJO_DEMO,
  demoVencido,
  esUnDemo,
  minutosQueQuedan,
  nuevoIdDeDemo,
  venceEn,
} from './demo';

/** Un azar de mentira, para que el id sea el mismo en cada corrida. */
const azarFijo = (valores: number[]) => (n: number) =>
  Uint8Array.from(Array.from({ length: n }, (_, i) => valores[i % valores.length] ?? 0));

describe('el id de un restaurante de prueba', () => {
  it('lleva el prefijo adelante', () => {
    // Para que se vea de un vistazo en la base, en un log y en la lista de
    // locales qué es de verdad y qué es de prueba.
    expect(nuevoIdDeDemo(azarFijo([0])).startsWith(PREFIJO_DEMO)).toBe(true);
  });

  it('es un slug válido: minúsculas, números y guiones', () => {
    const id = nuevoIdDeDemo(azarFijo([3, 200, 17, 99, 250, 8, 61, 42, 7, 130]));
    expect(id).toMatch(/^demo-[a-z2-9]{10}$/);
  });

  it('no usa letras que se confunden al dictarlo', () => {
    // El id se lee en pantalla y a veces se dicta por teléfono.
    const id = nuevoIdDeDemo(azarFijo(Array.from({ length: 64 }, (_, i) => i)));
    expect(id.slice(PREFIJO_DEMO.length)).not.toMatch(/[lo01]/);
  });

  it('cambia con el azar', () => {
    const uno = nuevoIdDeDemo(azarFijo([1, 2, 3]));
    const otro = nuevoIdDeDemo(azarFijo([9, 8, 7]));
    expect(uno).not.toBe(otro);
  });

  it('se reconoce después', () => {
    expect(esUnDemo('demo-7k2f9qx3rt')).toBe(true);
    expect(esUnDemo('resto-itadaki')).toBe(false);
    // El que se llama parecido pero no lleva el guion no cuenta.
    expect(esUnDemo('demostenes')).toBe(false);
  });
});

describe('cuándo vence', () => {
  const ahora = new Date('2026-10-01T20:00:00Z');

  it('dos horas después de nacer', () => {
    expect(venceEn(ahora).toISOString()).toBe('2026-10-01T22:00:00.000Z');
    expect(HORAS_DE_DEMO).toBe(2);
  });

  it('antes de la hora se puede usar', () => {
    expect(demoVencido(new Date('2026-10-01T21:59:00Z'), ahora)).toBe(false);
  });

  it('en la hora justa, ya no', () => {
    // El borde va para el lado seguro: cumplido el plazo, no entra.
    expect(demoVencido(new Date('2026-10-01T20:00:00Z'), ahora)).toBe(true);
  });

  it('dice cuánto queda, para avisarle a quien está adentro', () => {
    expect(minutosQueQuedan(new Date('2026-10-01T20:45:00Z'), ahora)).toBe(45);
  });

  it('y no inventa minutos de un vencido', () => {
    expect(minutosQueQuedan(new Date('2026-10-01T19:00:00Z'), ahora)).toBe(0);
  });
});
