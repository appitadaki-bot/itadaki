import {
  INTENTOS_ANTES_DE_TRABAR,
  LARGO_DEL_PIN,
  MINUTOS_TRABADA,
  estaTrabada,
  trasElIntento,
  nombreDeUsuario,
  nuevoPin,
  pareceUnPin,
  usuarioLibre,
} from './usuario-y-pin';

/**
 * Cómo entra el personal que no tiene mail de trabajo.
 *
 * El usuario se dicta en voz alta —"entrá con nico"— y el PIN se tipea en un
 * teléfono, de parado. Todo lo que se pruebe acá sale de eso: nada que
 * dependa de acentos, de mayúsculas ni de recordar símbolos.
 */

describe('el nombre de usuario', () => {
  it('pasa todo a minúscula', () => {
    // Se dicta hablando, y nadie aclara mayúsculas.
    const usuario = nombreDeUsuario('Nico');
    if (usuario.isErr()) throw new Error('expected ok');

    expect(usuario.value).toBe('nico');
  });

  it('saca los acentos', () => {
    // "Martín" dictado se escribe "martin" la mitad de las veces.
    const usuario = nombreDeUsuario('Martín');
    if (usuario.isErr()) throw new Error('expected ok');

    expect(usuario.value).toBe('martin');
  });

  it('convierte los espacios en punto', () => {
    const usuario = nombreDeUsuario('Juan Pablo');
    if (usuario.isErr()) throw new Error('expected ok');

    expect(usuario.value).toBe('juan.pablo');
  });

  it('limpia los espacios de los costados', () => {
    const usuario = nombreDeUsuario('  nico  ');
    if (usuario.isErr()) throw new Error('expected ok');

    expect(usuario.value).toBe('nico');
  });

  it('rechaza uno de una sola letra', () => {
    // Un usuario de una letra se confunde al dictarlo.
    expect(nombreDeUsuario('n').isErr()).toBe(true);
  });

  it('rechaza símbolos', () => {
    const usuario = nombreDeUsuario('nico@casa');
    if (usuario.isOk()) throw new Error('debería rechazarlo');

    expect(usuario.error.kind).toBe('CARACTERES_INVALIDOS');
  });

  it('rechaza uno desmedidamente largo', () => {
    expect(nombreDeUsuario('a'.repeat(50)).isErr()).toBe(true);
  });
});

describe('elegir un usuario libre', () => {
  it('usa el nombre tal cual si nadie lo tiene', () => {
    // "nico" es mejor que "nico1": el número molesta si no hace falta.
    expect(usuarioLibre('Nico', new Set())).toBe('nico');
  });

  it('agrega un número si ya está tomado', () => {
    // Empieza en 2 y no en 1: "nico2" dice que hay otro Nico, "nico1" haría
    // pensar que el primero también tiene número.
    expect(usuarioLibre('Nico', new Set(['nico']))).toBe('nico2');
  });

  it('sigue subiendo mientras estén tomados', () => {
    expect(usuarioLibre('Nico', new Set(['nico', 'nico2', 'nico3']))).toBe('nico4');
  });

  it('con un nombre impresentable cae a algo usable', () => {
    // Sin esto, el dueño queda trabado en el formulario por un nombre raro.
    const usuario = usuarioLibre('!!!', new Set());

    expect(usuario).toBe('staff');
  });
});

describe('el PIN', () => {
  it('tiene seis dígitos', () => {
    expect(nuevoPin()).toMatch(/^\d{6}$/);
  });

  it('no repite el mismo dos veces seguidas', () => {
    // Dos altas seguidas con el mismo PIN sería que el segundo entra con el
    // del primero.
    const pines = new Set(Array.from({ length: 50 }, () => nuevoPin()));

    expect(pines.size).toBeGreaterThan(45);
  });

  it('usa los diez dígitos, no un puñado', () => {
    // Un generador sesgado achica el espacio real de combinaciones sin que
    // nadie lo note: el PIN sigue teniendo seis dígitos y es mucho más fácil
    // de adivinar.
    const vistos = new Set(Array.from({ length: 200 }, () => nuevoPin()).join(''));

    expect(vistos.size).toBe(10);
  });

  it('puede empezar con cero', () => {
    // Guardarlo como número perdería el cero de adelante y el PIN dejaría de
    // coincidir. Con doscientos, que ninguno empiece en cero sería sospechoso.
    const conCero = Array.from({ length: 200 }, () => nuevoPin()).filter((pin) =>
      pin.startsWith('0'),
    );

    expect(conCero.length).toBeGreaterThan(0);
  });
});

describe('reconocer un PIN', () => {
  it('acepta seis dígitos', () => {
    expect(pareceUnPin('481302')).toBe(true);
  });

  it('acepta con espacios de los costados', () => {
    // Copiar y pegar de un mensaje arrastra espacios.
    expect(pareceUnPin(' 481302 ')).toBe(true);
  });

  it('rechaza uno más corto o más largo', () => {
    expect(pareceUnPin('4813')).toBe(false);
    expect(pareceUnPin('48130299')).toBe(false);
  });

  it('rechaza letras', () => {
    expect(pareceUnPin('4813ab')).toBe(false);
  });

  it('el largo declarado y el generado coinciden', () => {
    // Si alguien cambia la constante, esto lo cruza con lo que se genera.
    expect(nuevoPin()).toHaveLength(LARGO_DEL_PIN);
  });
});

describe('trabar la cuenta tras varios PIN fallidos', () => {
  const AHORA = new Date('2026-08-28T21:00:00Z');

  it('un fallido suelto no traba nada', () => {
    // El mozo apurado se equivoca; eso no es un ataque.
    const resultado = trasElIntento(0, false, AHORA);

    expect(resultado.trabadoHasta).toBeNull();
    expect(resultado.intentos).toBe(1);
  });

  it('traba al llegar al quinto', () => {
    const resultado = trasElIntento(INTENTOS_ANTES_DE_TRABAR - 1, false, AHORA);

    expect(resultado.trabadoHasta).not.toBeNull();
  });

  it('traba por quince minutos', () => {
    const resultado = trasElIntento(INTENTOS_ANTES_DE_TRABAR - 1, false, AHORA);
    const minutos = ((resultado.trabadoHasta?.getTime() ?? 0) - AHORA.getTime()) / 60_000;

    expect(minutos).toBe(MINUTOS_TRABADA);
  });

  it('acertar borra el contador', () => {
    // El mozo que se equivocó dos veces no arrastra eso el resto del turno.
    const resultado = trasElIntento(3, true, AHORA);

    expect(resultado.intentos).toBe(0);
    expect(resultado.trabadoHasta).toBeNull();
  });

  it('la cuenta trabada lo está hasta que pasa el rato', () => {
    const hasta = new Date(AHORA.getTime() + 5 * 60_000);

    expect(estaTrabada(hasta, AHORA)).toBe(true);
  });

  it('deja de estarlo sola', () => {
    // Sin esto el mozo depende de encontrar al dueño para volver a entrar, en
    // pleno servicio.
    const hasta = new Date(AHORA.getTime() - 60_000);

    expect(estaTrabada(hasta, AHORA)).toBe(false);
  });

  it('una cuenta que nunca se trabó no está trabada', () => {
    expect(estaTrabada(null, AHORA)).toBe(false);
  });

  it('cinco intentos cada quince minutos son años para un millón de PINes', () => {
    // La cuenta que justifica seis dígitos: si esto bajara mucho, el PIN
    // dejaría de alcanzar y habría que cambiarlo por otra cosa.
    const porDia = (INTENTOS_ANTES_DE_TRABAR * 60 * 24) / MINUTOS_TRABADA;
    const anios = 1_000_000 / porDia / 365;

    expect(anios).toBeGreaterThan(3);
  });
});
