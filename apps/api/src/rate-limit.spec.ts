import {
  CUPO_ENTRAR,
  CUPO_SENTARSE,
  consumir,
  esIntentoDeEntrar,
  esSentarseAUnaMesa,
  limitadorPorIp,
  purgar,
  type Cubo,
} from './rate-limit';

const cupo = { limite: 3, ventanaMs: 60_000 };

describe('el tope por IP', () => {
  it('deja pasar hasta el límite', () => {
    let cubo: Cubo | undefined;
    for (let intento = 1; intento <= 3; intento += 1) {
      const paso = consumir(cubo, 1_000, cupo);
      expect(paso.permitido).toBe(true);
      cubo = paso.cubo;
    }
  });

  it('frena el que se pasa, y dice cuánto esperar', () => {
    let cubo: Cubo | undefined;
    for (let intento = 1; intento <= 3; intento += 1) {
      cubo = consumir(cubo, 1_000, cupo).cubo;
    }

    const frenado = consumir(cubo, 1_000, cupo);
    expect(frenado.permitido).toBe(false);
    expect(frenado.esperarSegundos).toBe(60);
  });

  /** Frenar para siempre no es un tope, es una expulsión. */
  it('repone al vencer la ventana', () => {
    let cubo: Cubo | undefined;
    for (let intento = 1; intento <= 3; intento += 1) {
      cubo = consumir(cubo, 1_000, cupo).cubo;
    }

    expect(consumir(cubo, 62_000, cupo).permitido).toBe(true);
  });

  /**
   * Lo que separa un contador de una pérdida de memoria: sin esto queda una
   * entrada por cada IP que pasó alguna vez.
   */
  it('olvida a los que ya no cuentan', () => {
    const cubos = new Map<string, Cubo>([
      ['vieja', { usados: 3, vence: 500 }],
      ['activa', { usados: 1, vence: 90_000 }],
    ]);

    purgar(cubos, 1_000);

    expect([...cubos.keys()]).toEqual(['activa']);
  });
});

describe('el middleware', () => {
  const hacer = () => {
    const enviado: { codigo?: number; cuerpo?: unknown; headers: Record<string, string> } = {
      headers: {},
    };
    const respuesta = {
      status(codigo: number) {
        enviado.codigo = codigo;
        return respuesta;
      },
      setHeader(nombre: string, valor: string) {
        enviado.headers[nombre] = valor;
      },
      json(cuerpo: unknown) {
        enviado.cuerpo = cuerpo;
      },
    };
    return { enviado, respuesta };
  };

  it('frena al undécimo intento de entrar', () => {
    const limitar = limitadorPorIp(() => 1_000);
    let pasaron = 0;

    for (let intento = 1; intento <= 11; intento += 1) {
      const { enviado, respuesta } = hacer();
      limitar({ ip: '1.2.3.4', url: '/api/auth/login' }, respuesta, () => {
        pasaron += 1;
      });
      if (intento === 11) {
        expect(enviado.codigo).toBe(429);
        expect(enviado.headers['Retry-After']).toBe('60');
      }
    }

    expect(pasaron).toBe(10);
  });

  /** Mirar la carta no puede dejar a esa mesa sin poder entrar. */
  it('cuenta aparte lo de entrar y lo demás', () => {
    const limitar = limitadorPorIp(() => 1_000);

    for (let intento = 1; intento <= 20; intento += 1) {
      const { respuesta } = hacer();
      limitar({ ip: '1.2.3.4', url: '/api/menu' }, respuesta, () => undefined);
    }

    let paso = false;
    const { respuesta } = hacer();
    limitar({ ip: '1.2.3.4', url: '/api/auth/login' }, respuesta, () => {
      paso = true;
    });

    expect(paso).toBe(true);
  });

  /** El orquestador de Render la consulta cada pocos segundos. */
  it('no le cuenta a salud', () => {
    const limitar = limitadorPorIp(() => 1_000);
    let pasaron = 0;

    for (let intento = 1; intento <= 400; intento += 1) {
      const { respuesta } = hacer();
      limitar({ ip: '1.2.3.4', url: '/api/health' }, respuesta, () => {
        pasaron += 1;
      });
    }

    expect(pasaron).toBe(400);
  });

  it('una IP no gasta la cuota de otra', () => {
    const limitar = limitadorPorIp(() => 1_000);

    for (let intento = 1; intento <= 10; intento += 1) {
      const { respuesta } = hacer();
      limitar({ ip: '1.1.1.1', url: '/api/auth/login' }, respuesta, () => undefined);
    }

    let paso = false;
    const { respuesta } = hacer();
    limitar({ ip: '9.9.9.9', url: '/api/auth/login' }, respuesta, () => {
      paso = true;
    });

    expect(paso).toBe(true);
  });
});

describe('sentarse a una mesa tiene su propio cupo', () => {
  /**
   * Los comensales de un restaurante salen todos por el mismo WiFi, así que
   * para el servidor son una sola IP. Con `/sessions/join` compartiendo el
   * cupo del login —10 por minuto— un grupo de doce que se sentaba junto
   * gastaba el cupo entero y los últimos dos veían un error.
   *
   * Apareció probando veinte mesas pidiendo a la vez: entraron nueve.
   */
  it('unirse a una mesa no es un intento de credencial', () => {
    expect(esIntentoDeEntrar('/api/sessions/join')).toBe(false);
    expect(esSentarseAUnaMesa('/api/sessions/join')).toBe(true);
  });

  it('el login sigue protegido como antes', () => {
    // Ahí sí se prueba una contraseña, y quien prueba de a miles busca
    // acertar una.
    expect(esIntentoDeEntrar('/api/auth/login')).toBe(true);
    expect(esSentarseAUnaMesa('/api/auth/login')).toBe(false);
  });

  it('el alta y el cambio de contraseña también', () => {
    expect(esIntentoDeEntrar('/api/auth/signup')).toBe(true);
    expect(esIntentoDeEntrar('/api/auth/password')).toBe(true);
  });

  it('aguanta un salón lleno rotando', () => {
    // Veinte mesas que se sientan, más las que rotan durante el servicio.
    expect(CUPO_SENTARSE.limite).toBeGreaterThanOrEqual(100);
  });

  it('pero sigue habiendo un tope', () => {
    // Sin ninguno, una máquina abre sesiones sin fin. Lo que cambia es que el
    // tope sea el de un salón y no el de un formulario de contraseña.
    expect(Number.isFinite(CUPO_SENTARSE.limite)).toBe(true);
    expect(CUPO_SENTARSE.ventanaMs).toBe(60_000);
  });

  it('es más alto que el de las credenciales', () => {
    expect(CUPO_SENTARSE.limite).toBeGreaterThan(CUPO_ENTRAR.limite);
  });
});
