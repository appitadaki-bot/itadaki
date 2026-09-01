import { linkDeResena, pideResenas } from './resena-google';

/**
 * El link donde el comensal deja su reseña.
 *
 * Lo pega el dueño una vez, copiándolo de su panel de Google. Ahí es donde se
 * equivoca: pega el link de su web, el de Maps para llegar al local, o
 * directamente lo que tenía en el portapapeles. Un link roto no falla en el
 * panel — falla en el teléfono de un cliente conforme, que es el peor lugar.
 */

describe('validar el link de reseñas', () => {
  it('acepta el link corto que da Google', () => {
    const link = linkDeResena('https://g.page/r/CabcDEF123/review');
    expect(link.isOk()).toBe(true);
  });

  it('acepta el que sale del buscador', () => {
    // El dueño copia desde donde lo encuentra, no desde donde deberíamos.
    expect(linkDeResena('https://search.google.com/local/writereview?placeid=abc').isOk()).toBe(
      true,
    );
  });

  it('acepta el corto de Maps', () => {
    expect(linkDeResena('https://maps.app.goo.gl/abc123').isOk()).toBe(true);
  });

  it('rechaza el link de otra página', () => {
    // El caso común: pega la web de su restaurante.
    const link = linkDeResena('https://mirestaurante.com.ar');
    if (link.isOk()) throw new Error('debería rechazarlo');

    expect(link.error.kind).toBe('NO_ES_DE_GOOGLE');
  });

  it('rechaza texto que no es una URL', () => {
    // Lo que tenía en el portapapeles.
    const link = linkDeResena('Parrilla Don Pepe, Av. Corrientes 1234');
    if (link.isOk()) throw new Error('debería rechazarlo');

    expect(link.error.kind).toBe('NO_ES_UNA_URL');
  });

  it('rechaza el campo vacío', () => {
    expect(linkDeResena('').isErr()).toBe(true);
    expect(linkDeResena('   ').isErr()).toBe(true);
  });

  it('rechaza http sin cifrar', () => {
    // Un link http en el teléfono de un cliente es una advertencia del
    // navegador justo cuando le estamos pidiendo un favor.
    expect(linkDeResena('http://g.page/r/abc/review').isErr()).toBe(true);
  });

  it('rechaza un dominio que sólo se parece', () => {
    // "g.page.malicioso.com" termina en algo que no es g.page.
    const link = linkDeResena('https://g.page.otrositio.com/r/abc');
    if (link.isOk()) throw new Error('debería rechazarlo');

    expect(link.error.kind).toBe('NO_ES_DE_GOOGLE');
  });

  it('acepta un subdominio real de Google', () => {
    expect(linkDeResena('https://www.search.google.com/local/writereview?x=1').isOk()).toBe(true);
  });

  it('limpia los espacios de los costados', () => {
    // Copiar y pegar arrastra espacios, y un espacio adelante rompe la URL.
    const link = linkDeResena('  https://g.page/r/abc/review  ');
    if (link.isErr()) throw new Error('expected ok');

    expect(link.value).toBe('https://g.page/r/abc/review');
  });

  it('rechaza algo desmedidamente largo', () => {
    const link = linkDeResena(`https://g.page/${'x'.repeat(600)}`);
    if (link.isOk()) throw new Error('debería rechazarlo');

    expect(link.error.kind).toBe('DEMASIADO_LARGO');
  });
});

describe('si el local pide reseñas', () => {
  it('sin link configurado, no', () => {
    // Lo que pasa por defecto: nadie ve nada hasta que el dueño lo configura.
    expect(pideResenas(null)).toBe(false);
    expect(pideResenas('')).toBe(false);
    expect(pideResenas('   ')).toBe(false);
  });

  it('con link, sí', () => {
    expect(pideResenas('https://g.page/r/abc/review')).toBe(true);
  });
});

/**
 * Maps desde la computadora.
 *
 * Compartir ahí no da el link corto sino la dirección larga, y en Argentina
 * con el dominio local. Es lo que tiene a mano el que está sentado
 * configurando su local, y se rechazaba sin decir dónde estaba el "bueno".
 */
describe('el link que da Maps en la computadora', () => {
  it.each([
    'https://www.google.com/maps/place/Mi+Restaurante/@-34.6,-58.4,17z',
    'https://www.google.com.ar/maps/place/Mi+Restaurante',
    'https://google.com/maps/place/Mi+Restaurante',
    'https://www.google.com/local/place/qa/review',
  ])('acepta %s', (link) => {
    expect(linkDeResena(link).isOk()).toBe(true);
  });

  /** Lo que quedó en el portapapeles no es un link de reseña. */
  it.each(['https://www.google.com', 'https://www.google.com/', 'https://google.com/gmail'])(
    'rechaza %s',
    (link) => {
      const resultado = linkDeResena(link);
      expect(resultado.isErr()).toBe(true);
      if (resultado.isErr()) expect(resultado.error.kind).toBe('NO_ES_DE_GOOGLE');
    },
  );

  /** Un dominio que sólo empieza igual no es Google. */
  it.each(['https://google.com.evil.example/maps/place/x', 'https://notgoogle.com/maps/place/x'])(
    'no se deja engañar por %s',
    (link) => {
      expect(linkDeResena(link).isErr()).toBe(true);
    },
  );
});
