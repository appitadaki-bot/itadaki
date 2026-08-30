import { comoTratarLasPendientes } from './migraciones-al-dia';

/**
 * Qué hace la API cuando le faltan migraciones.
 *
 * Esto salió de un caso real. El código que separa los medios de cobro se
 * desplegó, la migración que crea su columna nunca se corrió, y la API arrancó
 * como si nada: health check verde, deploy exitoso. El fallo apareció recién
 * cuando una mesa quiso ver su cuenta, con "column cobrado_minor does not
 * exist" — un error que no se parece en nada a "faltó correr las migraciones".
 *
 * Todas las mesas del restaurante vieron "no pudimos abrir la cuenta" hasta
 * que alguien fue a mirar por qué.
 */

describe('cuando faltan migraciones', () => {
  it('en producción no deja arrancar', () => {
    // El orquestador deja sirviendo la versión anterior, que anda, en vez de
    // reemplazarla por una que va a fallar en cada mesa.
    const queHacer = comoTratarLasPendientes(['030_medios_de_cobro.sql'], 'production');

    expect(queHacer?.rompe).toBe(true);
  });

  it('en una máquina de trabajo sólo avisa', () => {
    // Quien está desarrollando sabe que le falta correrlas; no poder levantar
    // la API por eso molesta más de lo que ayuda.
    const queHacer = comoTratarLasPendientes(['030_medios_de_cobro.sql'], 'development');

    expect(queHacer?.rompe).toBe(false);
  });

  it('sin NODE_ENV tampoco rompe', () => {
    // La variable no siempre está declarada, y romper por no encontrarla
    // dejaría a cualquiera sin poder levantar el proyecto.
    expect(comoTratarLasPendientes(['030_x.sql'], undefined)?.rompe).toBe(false);
  });
});

describe('cuando está todo aplicado', () => {
  it('no dice nada', () => {
    expect(comoTratarLasPendientes([], 'production')).toBeNull();
  });
});

describe('el mensaje sirve para arreglarlo', () => {
  const queHacer = comoTratarLasPendientes(
    ['029_usuario_y_pin.sql', '030_medios_de_cobro.sql'],
    'production',
  );

  it('dice cuántas faltan', () => {
    expect(queHacer?.mensaje).toContain('2 migraciones');
  });

  it('las nombra', () => {
    // Sin los nombres hay que ir a comparar el directorio con la base a mano.
    expect(queHacer?.mensaje).toContain('030_medios_de_cobro.sql');
    expect(queHacer?.mensaje).toContain('029_usuario_y_pin.sql');
  });

  it('dice qué comando corregirlo', () => {
    // El error viejo —"column X does not exist"— no llevaba a ninguna acción.
    expect(queHacer?.mensaje).toContain('db:migrate');
  });
});
