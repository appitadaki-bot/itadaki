import { type Database } from '@itadaki/shared/persistence';

/** Quién cerró la mesa, tal como se guarda. */
export interface QuienCerro {
  readonly id: string;
  readonly nombre: string;
  readonly rol: string;
}

export interface CierreDeMesa {
  readonly sessionId: string;
  readonly tableId: string;
  /** 'COBRO' o 'LIBERO'. */
  readonly queHizo: string;
  readonly quien: QuienCerro;
  /** Lo cobrado y con qué, cuando se cobró. Nulos al liberar. */
  readonly montoMinor: number | null;
  readonly medio: string | null;
}

/**
 * El registro de quién cerró cada mesa.
 *
 * La cuenta guardaba cuánto, con qué medio y cuándo — no quién. Si al otro día
 * faltaban cuarenta mil pesos, las métricas decían que habían entrado y no
 * había forma de reconstruir qué persona cerró esa mesa.
 *
 * Escribir acá nunca voltea el cobro que se está auditando: si falla el
 * registro, la mesa igual se cobró. Perder una línea es malo; dejar a un
 * cajero sin poder cerrar una mesa porque la auditoría tuvo un problema, con
 * el cliente esperando, es peor. Lo que no puede pasar es que se pierda en
 * silencio, así que el fallo queda en el log.
 */
export class PostgresCierres {
  constructor(
    private readonly db: Database,
    private readonly alFallar: (detalle: string) => void,
  ) {}

  async registrar(tenantId: string, cierre: CierreDeMesa): Promise<void> {
    try {
      await this.db.withTenant(tenantId, async (client) => {
        await client.query(
          `INSERT INTO cierres_de_mesa
             (tenant_id, id, session_id, table_id, que_hizo,
              quien_id, quien, rol, monto_minor, medio)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            tenantId,
            `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            cierre.sessionId,
            cierre.tableId,
            cierre.queHizo,
            cierre.quien.id,
            cierre.quien.nombre,
            cierre.quien.rol,
            cierre.montoMinor,
            cierre.medio,
          ],
        );
      });
    } catch (error) {
      this.alFallar(String(error));
    }
  }
}
