import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { type SessionReader, type SessionWriter } from '@itadaki/ordering/application';
import {
  InMemorySessionStore,
  PostgresInviteStore,
  PostgresSessionStore,
} from '@itadaki/ordering/infra';
import { database } from './database';
import { log } from './logger';

/**
 * Cuánto puede quedar abierta una mesa antes de darla por abandonada.
 *
 * Más que cualquier comida real: cerrar una mesa mientras la gente todavía
 * come le borra el carrito, que es mucho peor que liberarla una hora tarde.
 * Tres horas cubre una sobremesa larga y devuelve la mesa el mismo turno —
 * ocho la dejaban ocupada hasta la madrugada.
 *
 * Es la red de seguridad, no el camino normal: la mesa se libera sola al
 * cerrar la cuenta, y el mozo puede liberarla a mano cuando pagaron en caja.
 */
const STALE_AFTER_HOURS = Number(process.env['SESSION_STALE_HOURS'] ?? 3);

/**
 * Cuántos días se conserva el apodo de una mesa ya cerrada.
 *
 * Treinta, no cero: un restaurante que revisa lo que pasó el fin de semana
 * anterior todavía quiere ver quién pidió qué en una mesa que discutió la
 * cuenta. Pasado ese plazo el nombre no le sirve a nadie, y guardarlo es
 * conservar un dato personal sin motivo.
 */
const FORGET_DINERS_AFTER_DAYS = Number(process.env['FORGET_DINERS_DAYS'] ?? 30);
const SWEEP_EVERY_MS = 30 * 60_000;

@Injectable()
export class SessionsService implements OnModuleInit, OnModuleDestroy {
  readonly store: SessionReader & SessionWriter =
    process.env['USE_POSTGRES'] !== 'false'
      ? new PostgresSessionStore(database)
      : new InMemorySessionStore();

  readonly invites = new PostgresInviteStore(database);

  private sweeper: ReturnType<typeof setInterval> | null = null;

  onModuleInit(): void {
    if (!(this.store instanceof PostgresSessionStore)) return;

    // A group that leaves without asking for the bill would otherwise hold its
    // table forever — only one session per table may be OPEN at a time.
    void this.sweep();
    this.sweeper = setInterval(() => void this.sweep(), SWEEP_EVERY_MS);
    // Never keep the process alive just for the sweep.
    this.sweeper.unref?.();
  }

  onModuleDestroy(): void {
    if (this.sweeper !== null) clearInterval(this.sweeper);
  }

  private async sweep(): Promise<void> {
    if (!(this.store instanceof PostgresSessionStore)) return;

    const closed = await this.store.closeStale(STALE_AFTER_HOURS);
    if (closed.isOk() && closed.value > 0) {
      log.info('abandoned sessions closed', { closed: closed.value });
    }

    // El apodo se borra cuando ya no cumple ninguna función. Es el único dato
    // del comensal que guardamos, y la política de privacidad promete no
    // conservarlo de más — una promesa que no se cumple sola.
    const olvidadas = await this.store.forgetDiners(FORGET_DINERS_AFTER_DAYS);
    if (olvidadas.isOk() && olvidadas.value > 0) {
      log.info('apodos borrados de mesas cerradas', { mesas: olvidadas.value });
    }

    // Las invitaciones vencidas no sirven para nada y se acumulan de a una por
    // invitado. Van con el mismo barrido para no tener dos relojes corriendo.
    const purged = await this.invites.purgeExpired(new Date());
    if (purged.isOk() && purged.value > 0) {
      log.info('expired invites purged', { purged: purged.value });
    }
  }
}
