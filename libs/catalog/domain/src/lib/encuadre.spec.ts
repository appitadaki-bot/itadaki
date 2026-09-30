import {
  ENCUADRE_ENTERO,
  centrarDentro,
  esLaFotoEntera,
  recorteEnPixeles,
  validarEncuadre,
} from './encuadre';

describe('la foto entera', () => {
  it('es un cuadrado del lado más largo, centrado', () => {
    // Una apaisada de 900x600: el cuadrado mide 900 y se pasa 150 arriba y
    // 150 abajo, que es justo el relleno.
    expect(recorteEnPixeles(ENCUADRE_ENTERO, 900, 600)).toEqual({ left: 0, top: -150, lado: 900 });
  });

  it('y en una vertical se pasa por los costados', () => {
    expect(recorteEnPixeles(ENCUADRE_ENTERO, 600, 900)).toEqual({ left: -150, top: 0, lado: 900 });
  });

  it('en una foto ya cuadrada no sobra nada', () => {
    expect(recorteEnPixeles(ENCUADRE_ENTERO, 800, 800)).toEqual({ left: 0, top: 0, lado: 800 });
  });

  it('se reconoce sin mirar la foto', () => {
    // Para no mandarle al servidor lo que ya hace solo.
    expect(esLaFotoEntera(ENCUADRE_ENTERO)).toBe(true);
    expect(esLaFotoEntera({ cx: 0.5, cy: 0.5, lado: 0.6 })).toBe(false);
    expect(esLaFotoEntera({ cx: 0.3, cy: 0.5, lado: 1 })).toBe(false);
  });
});

describe('acercarse a una parte', () => {
  it('toma un cuadrado más chico alrededor del centro elegido', () => {
    // La mitad del lado largo, centrada en el cuarto izquierdo.
    expect(recorteEnPixeles({ cx: 0.25, cy: 0.5, lado: 0.5 }, 1000, 800)).toEqual({
      left: 0,
      top: 150,
      lado: 500,
    });
  });
});

describe('el encuadre no se sale de la foto', () => {
  it('en el eje donde el cuadrado ya no entra, queda centrado', () => {
    // Apaisada de 900x600 con el cuadrado de 600: a lo alto ya toca los dos
    // bordes, así que subirlo sólo metería relleno.
    const acotado = centrarDentro({ cx: 0.1, cy: 0.1, lado: 600 / 900 }, 900, 600);
    expect(acotado.cy).toBe(0.5);
  });

  it('en el eje largo se puede pasear, hasta el borde', () => {
    const acotado = centrarDentro({ cx: 0, cy: 0.5, lado: 600 / 900 }, 900, 600);
    // Medio cuadrado de margen: 300 de 900.
    expect(acotado.cx).toBeCloseTo(1 / 3, 5);
  });

  it('la foto entera queda centrada en los dos ejes', () => {
    expect(centrarDentro({ cx: 0.2, cy: 0.9, lado: 1 }, 900, 600)).toEqual(ENCUADRE_ENTERO);
  });

  it('nunca deja alejarse más que la foto entera', () => {
    expect(centrarDentro({ cx: 0.5, cy: 0.5, lado: 3 }, 900, 600).lado).toBe(1);
  });
});

describe('lo que llega del navegador', () => {
  it('un lado en cero se rechaza', () => {
    // Sharp reventaría adentro de la tubería, donde el error no dice nada.
    expect(validarEncuadre({ cx: 0.5, cy: 0.5, lado: 0 }).isErr()).toBe(true);
  });

  it('un centro fuera de la foto se rechaza', () => {
    expect(validarEncuadre({ cx: 1.4, cy: 0.5, lado: 0.5 }).isErr()).toBe(true);
  });

  it('un NaN se rechaza', () => {
    expect(validarEncuadre({ cx: Number.NaN, cy: 0.5, lado: 0.5 }).isErr()).toBe(true);
  });

  it('uno bueno pasa tal cual', () => {
    const encuadre = { cx: 0.4, cy: 0.6, lado: 0.5 };
    const validado = validarEncuadre(encuadre);
    expect(validado.isOk() && validado.value).toEqual(encuadre);
  });
});
