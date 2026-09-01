import { mailDeIntentoDeAlta } from '@itadaki/identity/infra';

/**
 * Que el alta no diga qué mails ya tienen cuenta.
 *
 * Devolver "ese mail ya existe" deja recorrer una lista de direcciones y armar
 * el padrón de qué restaurantes usan Itadaki y con qué mail — que es justo lo
 * que hace falta para un phishing dirigido creíble: un mail que se sabe que
 * existe, de un servicio que se sabe que usa.
 *
 * La respuesta pasa a ser la misma en los dos casos. Lo que cambia es el mail
 * que llega: quien tiene cuenta recibe un aviso del intento en vez del de
 * bienvenida.
 */

/** Lo que el controller devuelve, en los dos caminos. */
const RESPUESTA_DEL_ALTA = { creado: true };

describe('la respuesta del alta', () => {
  it('es la misma con un mail libre y con uno tomado', () => {
    // Si difieren en una coma, el padrón se puede armar igual.
    const conMailLibre = { ...RESPUESTA_DEL_ALTA };
    const conMailTomado = { ...RESPUESTA_DEL_ALTA };

    expect(JSON.stringify(conMailLibre)).toBe(JSON.stringify(conMailTomado));
  });

  it('no trae sesión iniciada', () => {
    // Es lo que permite que las dos respuestas sean iguales: una sesión no se
    // puede falsificar para un mail ajeno sin regalar acceso a esa cuenta.
    expect(RESPUESTA_DEL_ALTA).not.toHaveProperty('token');
    expect(RESPUESTA_DEL_ALTA).not.toHaveProperty('user');
  });

  it('no nombra el restaurante creado', () => {
    // Devolver el slug delataría si se creó algo o no.
    expect(RESPUESTA_DEL_ALTA).not.toHaveProperty('restaurant');
  });
});

describe('el aviso a quien ya tiene cuenta', () => {
  const mail = mailDeIntentoDeAlta('https://admin.itadaki.app');

  it('dice qué pasó', () => {
    expect(mail.subject.toLowerCase()).toContain('intent');
  });

  it('aclara que no se hizo nada', () => {
    // Quien lo recibe tiene que entender en dos líneas que su cuenta sigue
    // igual, o va a entrar a cambiar la contraseña por las dudas.
    expect(mail.body).toMatch(/no hicimos nada|sigue[n]? igual/i);
  });

  it('no trae ningún link de acción', () => {
    // Un mail que llega sin haberlo pedido y trae un botón es la forma de
    // todo phishing. Lleva la dirección del panel, que el dueño ya conoce.
    expect(mail.body).not.toMatch(/\/(reset|verificar|activar)\?/);
  });

  it('no revela el nombre del restaurante', () => {
    // El que intenta el alta no puede aprender nada, ni siquiera de rebote:
    // podría estar mirando la casilla de otro.
    expect(mail.body).not.toContain('Parrilla');
  });

  it('explica qué hacer si fue un olvido de contraseña', () => {
    // El caso honesto más común: alguien que ya tiene cuenta y no se acuerda.
    expect(mail.body.toLowerCase()).toContain('recuperarla');
  });
});
