import 'reflect-metadata';
import './sentry';
import { type ServerResponse } from 'node:http';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { USING_DEV_SECRET } from './auth';
import { databaseAvailable } from './database';
import { comoTratarLasPendientes, migracionesQueFaltan } from './migraciones-al-dia';
import { axiomEnabled, log } from './logger';
import { ErrorFilter } from './error.filter';
import { limitadorPorIp } from './rate-limit';
import { sentryEnabled } from './sentry';

const PORT = Number(process.env['PORT'] ?? 3000);

/**
 * Browsers that may call this API.
 *
 * `origin: true` reflects whatever origin asks, which means any website can
 * make authenticated calls from a signed-in user's browser. In development the
 * local apps are allowed by name; in production the list has to be given.
 */
const DEV_ORIGINS = [
  'http://localhost:4200',
  'http://localhost:4300',
  'http://localhost:4400',
  'http://localhost:4500',
  // El salón. Faltaba: `ng serve floor-web` no tiene puerto en los scripts, así
  // que se levanta a mano y el que estaba libre quedaba fuera de esta lista —
  // la app cargaba pero el navegador le bloqueaba cada llamada a la API.
  'http://localhost:4600',
];

function allowedOrigins(): string[] {
  const configured = process.env['CORS_ORIGINS'];
  if (configured !== undefined && configured !== '') {
    return configured.split(',').map((origin) => origin.trim()).filter((origin) => origin !== '');
  }

  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('CORS_ORIGINS is required in production');
  }
  return DEV_ORIGINS;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Detrás del proxy de Render, `request.ip` sin esto es la IP del proxy: el
  // tope por IP caería sobre todos los comensales a la vez. Con esto se lee
  // `X-Forwarded-For`, que ese mismo proxy escribe.
  app.set('trust proxy', 1);

  const origins = allowedOrigins();
  app.enableCors({
    origin: origins,
    credentials: true,
    // The diner app sends its table token on every scoped request.
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Table-Token', 'Idempotency-Key'],
  });
  // Express announces itself by default, which tells an attacker what to
  // look up known bugs for.
  app.getHttpAdapter().getInstance().disable('x-powered-by');

  // Baseline response headers.
  //
  // Written by hand rather than pulling in helmet: this is an API that serves
  // JSON and cached image bytes, so most of what helmet sets would not apply.
  // What matters here is that a browser never sniffs a response into something
  // executable, and that the API cannot be framed.
  app.use((_request: unknown, response: ServerResponse, next: () => void) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    // Nothing here is meant to be embedded or scripted; the apps are separate.
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    // Only meaningful over TLS, and only set there: sending it in development
    // would pin a browser to https://localhost.
    if (process.env['NODE_ENV'] === 'production') {
      response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // Un tope de pedidos por IP, antes de que nada mire la base.
  app.use(limitadorPorIp());

  // Renders unhandled errors as a plain 500 instead of leaking a stack trace.
  app.useGlobalFilters(new ErrorFilter());
  // Base64 originals ride in the JSON body; 15 MB of binary is ~20 MB encoded.
  app.useBodyParser('json', { limit: '25mb' });
  app.setGlobalPrefix('api');

  // Checked before listening: an instance that cannot reach Postgres cannot
  // take an order, and coming up anyway means a deploy looks healthy while
  // every table gets an error. In production that is a failed boot, so the
  // orchestrator keeps the previous version serving instead.
  const usingPostgres = process.env['USE_POSTGRES'] !== 'false';
  const reachable = usingPostgres ? await databaseAvailable() : false;

  if (usingPostgres && !reachable) {
    const detail = 'postgres UNREACHABLE — check DATABASE_URL, or set USE_POSTGRES=false';
    if (process.env['NODE_ENV'] === 'production') {
      throw new Error(detail);
    }
    // Locally a demo without the database still beats refusing to start.
    log.warn(detail);
  }

  /*
   * El esquema, antes de aceptar pedidos.
   *
   * Una migración sin aplicar no se nota al desplegar: la API arranca, el
   * health check pasa, y el fallo aparece más tarde en el teléfono de un
   * comensal, con un error de Postgres que no se parece a su causa. Mejor que
   * el deploy falle acá, donde lo ve quien lo hizo.
   */
  if (usingPostgres && reachable) {
    const faltan = await migracionesQueFaltan();
    const queHacer = comoTratarLasPendientes(faltan, process.env['NODE_ENV']);

    if (queHacer !== null) {
      if (queHacer.rompe) throw new Error(queHacer.mensaje);
      log.warn(queHacer.mensaje);
    }
  }

  await app.listen(PORT);

  const storage = usingPostgres
    ? reachable
      ? 'postgres'
      : 'postgres UNREACHABLE — set USE_POSTGRES=false to run in memory'
    : 'in-memory (data is lost on restart)';

  log.info('api listening', {
    url: `http://localhost:${PORT}/api`,
    storage,
    cors: origins.join(', '),
    sentry: sentryEnabled,
    axiom: axiomEnabled,
  });

  if (USING_DEV_SECRET) {
    log.warn('using the development signing key — set AUTH_SECRET before deploying');
  }

  /*
   * Un origen faltante en CORS no falla al arrancar: falla cuando alguien
   * intenta usar esa página, y el navegador reporta el bloqueo como un
   * problema de red. La landing quedó fuera de la lista por eso —empezó
   * siendo estática y después pasó a crear cuentas— y el alta contestaba
   * "sin conexión" con la red perfecta.
   *
   * Contarlos no prueba que sean los correctos, pero cinco es lo que hay que
   * tener con las cuatro apps y la landing, y menos es una señal barata.
   */
  const ESPERADOS = 5;
  if (process.env['NODE_ENV'] === 'production' && origins.length < ESPERADOS) {
    log.warn('CORS_ORIGINS tiene menos orígenes de los esperados', {
      configurados: origins.length,
      esperados: ESPERADOS,
      nota: 'las cuatro apps y la landing; a la que falte, el navegador le bloquea todo',
    });
  }
}

void bootstrap();
