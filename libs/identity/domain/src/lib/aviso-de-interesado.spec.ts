import { correoDeInteresado, destinatariosDelAviso } from './aviso-de-interesado';
import { type Interesado } from './interesado';

const interesado = (cambios: Partial<Interesado> = {}): Interesado => ({
  local: 'Don Pepe',
  nombre: 'Esteban',
  whatsapp: '2645135540',
  email: null,
  mesas: null,
  carta: 'papel',
  cartaLink: null,
  ...cambios,
});

describe('a quiénes se les avisa', () => {
  it('acepta varias direcciones separadas por coma', () => {
    expect(destinatariosDelAviso('uno@itadaki.ar,dos@itadaki.ar')).toEqual([
      'uno@itadaki.ar',
      'dos@itadaki.ar',
    ]);
  });

  it('limpia los espacios de una lista pegada a mano', () => {
    expect(destinatariosDelAviso(' uno@itadaki.ar ,  dos@itadaki.ar ')).toEqual([
      'uno@itadaki.ar',
      'dos@itadaki.ar',
    ]);
  });

  it('no avisa dos veces a la misma dirección', () => {
    // Una lista mal pegada tenía la misma dirección repetida.
    expect(destinatariosDelAviso('uno@itadaki.ar,UNO@itadaki.ar')).toEqual(['uno@itadaki.ar']);
  });

  it('ignora comas de más', () => {
    expect(destinatariosDelAviso('uno@itadaki.ar,,')).toEqual(['uno@itadaki.ar']);
  });

  it('sin configurar, no hay a quién avisarle', () => {
    expect(destinatariosDelAviso('')).toEqual([]);
    expect(destinatariosDelAviso('   ')).toEqual([]);
  });
});

describe('qué dice el aviso', () => {
  it('nombra el local en el asunto', () => {
    expect(correoDeInteresado(interesado(), 'abc123').subject).toBe('Nuevo interesado: Don Pepe');
  });

  it('trae el WhatsApp, que es a dónde hay que escribir', () => {
    expect(correoDeInteresado(interesado(), 'abc123').body).toContain('2645135540');
  });

  it('dice cómo tiene la carta, que es cuánto trabajo es el alta', () => {
    expect(correoDeInteresado(interesado(), 'abc123').body).toContain('la tiene en papel');
  });

  it('trae el link cuando lo dejó', () => {
    const con = interesado({ carta: 'link', cartaLink: 'https://donpepe.com/carta' });
    expect(correoDeInteresado(con, 'abc123').body).toContain('https://donpepe.com/carta');
  });

  it('omite lo que no dejó en vez de decir null', () => {
    const cuerpo = correoDeInteresado(interesado(), 'abc123').body;
    expect(cuerpo).not.toContain('null');
    expect(cuerpo).not.toContain('Mail:');
    expect(cuerpo).not.toContain('Mesas:');
  });

  it('incluye lo opcional cuando está', () => {
    const cuerpo = correoDeInteresado(
      interesado({ email: 'esteban@donpepe.com', mesas: 12 }),
      'abc123',
    ).body;
    expect(cuerpo).toContain('esteban@donpepe.com');
    expect(cuerpo).toContain('12');
  });

  it('trae el id para poder marcarlo como atendido', () => {
    expect(correoDeInteresado(interesado(), 'abc123').body).toContain("id = 'abc123'");
  });
});
