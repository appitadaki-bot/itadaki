import {
  MIN_PASSWORD_LENGTH,
  credencialesDeLogin,
  validarContrasenaNueva,
  validateCredentials,
} from './staff';

/**
 * Las reglas de elegir una contraseña, y a quién NO se le aplican.
 *
 * Son dos cosas distintas que antes compartían una función: lo que se le
 * exige a quien elige una contraseña nueva, y lo que se le exige a quien
 * entra con la que ya tiene. Confundirlas tiene una consecuencia concreta y
 * cara: subir el mínimo deja afuera de su propio restaurante a todos los que
 * ya eligieron con las reglas viejas.
 *
 * Lo que de verdad tumba una cuenta —una contraseña repetida de un sitio que
 * se filtró— no se decide acá: eso lo mira el adaptador que consulta la lista
 * de filtradas, porque necesita salir a la red.
 */

const LARGA = 'trueno-mandarina-9fk2';

describe('elegir una contraseña nueva', () => {
  it('exige doce caracteres', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);

    const corta = validarContrasenaNueva('holis123');
    expect(corta.isErr()).toBe(true);
    if (corta.isErr()) expect(corta.error.kind).toBe('PASSWORD_TOO_SHORT');
  });

  it('rechaza las que se prueban primero', () => {
    // Con el mínimo en doce, casi toda la lista negra ya la frena el largo:
    // quedan las pocas que llegan, como ésta. El trabajo pesado ahora lo hace
    // la lista de filtradas, que es de millones y no de veinte.
    const comun = validarContrasenaNueva('administrador');
    expect(comun.isErr()).toBe(true);
    if (comun.isErr()) expect(comun.error.kind).toBe('PASSWORD_TOO_COMMON');
  });

  it('rechaza el nombre del restaurante', () => {
    // Lo primero que uno elige cuando tiene que inventar algo en el momento, y
    // lo primero que prueba quien sabe a quién le está apuntando.
    const obvia = validarContrasenaNueva('Enchulame2026!', {
      nombreDelLocal: 'Enchulame la máquina',
    });
    expect(obvia.isErr()).toBe(true);
    if (obvia.isErr()) expect(obvia.error.kind).toBe('PASSWORD_TOO_OBVIOUS');
  });

  it('no se escapa por los acentos', () => {
    // "Maquina" sin tilde contra "máquina" con tilde tiene que pegar igual, en
    // los dos sentidos: si no, la regla se esquiva sin querer.
    const sinTilde = validarContrasenaNueva('Maquina-del-9fk2', {
      nombreDelLocal: 'Enchulame la máquina',
    });
    expect(sinTilde.isErr()).toBe(true);
  });

  it('rechaza la parte del mail antes del arroba', () => {
    const conMail = validarContrasenaNueva('esteban-9fk2-xy', {
      email: 'esteban@hotmail.com',
    });
    expect(conMail.isErr()).toBe(true);
  });

  it('no bloquea palabras cortas del contexto', () => {
    // "don" aparece por casualidad adentro de cualquier cosa: bloquearlo
    // dejaría afuera media contraseña legítima.
    const buena = validarContrasenaNueva('abandonar-trueno-72', {
      nombreDelLocal: 'Don Pepe',
    });
    expect(buena.isOk()).toBe(true);
  });

  it('acepta una larga y sin relación', () => {
    expect(validarContrasenaNueva(LARGA, { nombreDelLocal: 'Don Pepe' }).isOk()).toBe(true);
  });

  it('el alta de una cuenta usa las mismas reglas', () => {
    const corta = validateCredentials('dueno@mail.com', 'holis123');
    expect(corta.isErr()).toBe(true);

    // Y el mail entra solo al contexto: no hace falta pasarlo dos veces.
    const conSuMail = validateCredentials('esteban@mail.com', 'esteban-trueno-9f');
    expect(conSuMail.isErr()).toBe(true);
    if (conSuMail.isErr()) expect(conSuMail.error.kind).toBe('PASSWORD_TOO_OBVIOUS');
  });
});

describe('entrar con la que ya tenés', () => {
  it('no le aplica las reglas de elegir', () => {
    // El caso que importa: alguien que eligió su contraseña cuando el mínimo
    // era ocho. Si el login exigiera doce, quedaría afuera de su restaurante
    // con un "credenciales inválidas" que no explica nada.
    expect(credencialesDeLogin('dueno@mail.com', 'holis123').isOk()).toBe(true);
    expect(credencialesDeLogin('dueno@mail.com', 'password123').isOk()).toBe(true);
  });

  it('igual pide un mail con forma de mail', () => {
    expect(credencialesDeLogin('no-es-un-mail', LARGA).isErr()).toBe(true);
  });

  it('y algo escrito en la contraseña', () => {
    expect(credencialesDeLogin('dueno@mail.com', '').isErr()).toBe(true);
  });
});
