import { Controller, Get, HttpStatus, NotFoundException, Res } from '@nestjs/common';
import { type Response } from 'express';
import { Public } from './auth';
import { databaseAvailable } from './database';

/**
 * Liveness and readiness for whatever runs this.
 *
 * Public and unauthenticated: a load balancer has no credentials, and the
 * response says nothing an attacker could not learn by sending a request.
 */
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  /**
   * Liveness, and honest about the database.
   *
   * Strictly, liveness only asks whether the process is up — but whoever wires
   * a load balancer reaches for `/health` first, and an instance that cannot
   * reach Postgres cannot take an order. Answering "ok" there sends real
   * diners to an API that will fail every request, so this probe answers 503
   * for the same reason `/ready` does. The uptime still tells a human that the
   * process itself is alive.
   */
  @Public()
  @Get()
  async live(@Res({ passthrough: true }) response: Response) {
    const uptimeSeconds = Math.floor((Date.now() - this.startedAt) / 1000);
    const usingPostgres = process.env['USE_POSTGRES'] !== 'false';
    const database = usingPostgres ? await databaseAvailable() : true;

    if (!database) {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: 'degraded', database: false, uptimeSeconds };
    }
    return { status: 'ok', database: true, uptimeSeconds };
  }

  /**
   * Readiness: whether this instance can actually serve traffic.
   *
   * Answers 503 when the database is unreachable so an orchestrator stops
   * routing to it instead of letting every request fail one by one.
   */
  @Public()
  @Get('ready')
  async ready(@Res({ passthrough: true }) response: Response) {
    const usingPostgres = process.env['USE_POSTGRES'] !== 'false';
    const database = usingPostgres ? await databaseAvailable() : true;

    if (!database) {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: 'degraded', database: false };
    }
    return { status: 'ok', database: true };
  }

  /**
   * Tira un error no controlado a propósito.
   *
   * Casi todo lo esperable en esta API vuelve como `Result`, no como
   * excepción — así que no hay forma "natural" de provocar un 500 real desde
   * afuera para confirmar que un error nuevo efectivamente llega a Sentry y a
   * Axiom. Esto lo da a mano. 404 en producción: no tiene sentido dejar un
   * botón para tirar la API a propósito ahí.
   */
  @Public()
  @Get('boom')
  boom(): void {
    if (process.env['NODE_ENV'] === 'production') {
      throw new NotFoundException();
    }
    throw new Error('itadaki-api: error de prueba disparado a mano (GET /health/boom)');
  }
}
