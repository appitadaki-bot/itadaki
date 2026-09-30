import { LADO_MAXIMO, medidaDeSubida } from './medida-de-subida';

describe('qué medida sale del teléfono', () => {
  it('una foto de teléfono se achica al lado máximo', () => {
    // 4032x3024 y cuatro megas: lo que sale de cualquier teléfono.
    expect(medidaDeSubida(4032, 3024, 4_000_000)).toEqual({ width: 2560, height: 1920 });
  });

  it('respeta la proporción de una vertical', () => {
    expect(medidaDeSubida(3024, 4032, 4_000_000)).toEqual({ width: 1920, height: 2560 });
  });

  it('una foto que ya está bien va tal cual', () => {
    // Reencodearla sólo perdería calidad por unos pocos kilobytes.
    expect(medidaDeSubida(1600, 1200, 400_000)).toBeNull();
  });

  it('una chica pero pesada se reencoda en su medida', () => {
    // Un PNG de mil por mil puede pesar cinco megas.
    expect(medidaDeSubida(1000, 1000, 5_000_000)).toEqual({ width: 1000, height: 1000 });
  });

  it('nunca agranda', () => {
    const medida = medidaDeSubida(800, 600, 9_000_000);
    expect(medida?.width).toBe(800);
    expect(medida?.height).toBe(600);
  });

  it('una foto sin medidas no se toca', () => {
    // Si el navegador no pudo leerla, se manda como vino y decide el servidor.
    expect(medidaDeSubida(0, 0, 100)).toBeNull();
  });

  it('el lado máximo es el mismo con el que el servidor guarda el original', () => {
    // Si se separan, el servidor vuelve a decodificar y achicar al pedo.
    expect(LADO_MAXIMO).toBe(2560);
  });
});
