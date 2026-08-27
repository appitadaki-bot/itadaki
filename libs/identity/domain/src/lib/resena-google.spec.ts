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
