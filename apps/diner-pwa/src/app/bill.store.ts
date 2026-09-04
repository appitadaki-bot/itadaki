import { Injectable, inject, signal } from '@angular/core';
import { ApiClient } from './api-client';

export interface MoneyDto {
  readonly amountInMinorUnits: number;
  readonly currency: string;
}

export interface BillDto {
  readonly id: string;
  readonly sessionId: string;
  readonly currency: string;
  readonly status: 'OPEN' | 'SETTLED';
  readonly subtotal: MoneyDto;
  readonly display: MoneyDto | null;
  readonly rates: ReadonlyArray<{ to: string; rate: number; capturedAt: string }>;
  readonly participants: ReadonlyArray<{ id: string; nickname: string; colorIndex: number }>;
  readonly lines: ReadonlyArray<{
    id: string;
    dinerId: string;
    name: string;
    quantity: number;
    unitTotal: MoneyDto;
  }>;
}

export interface SplitDto {
  readonly kind: string;
  readonly subtotal: MoneyDto;
  /** Cuánto baja por pagar en efectivo. Cero si no corresponde. */
  readonly descuento?: MoneyDto;
  /** Los puntos que el local ofrece, aunque todavía no hayan elegido. */
  readonly descuentoOfrecido?: number;
  readonly total: MoneyDto;
  readonly shares: ReadonlyArray<{
    payerId: string;
    label: string;
    amount: MoneyDto;
  }>;
}

export type SplitKind = 'SINGLE_PAYER' | 'EQUAL' | 'BY_DINER' | 'BY_ITEM' | 'CUSTOM_AMOUNT';

/**
 * Por qué no se pudo abrir la cuenta, en algo que se pueda leer sentado a una
 * mesa.
 *
 * Cada caso termina en algo que el comensal puede hacer. "No pudimos abrir la
 * cuenta" era cierto y no servía para nada: quien acaba de pedir no sabe si
 * esperar, tocar de nuevo, o llamar al mozo.
 */
function porQueNoAbre(
  kind: string | undefined,
  status: number,
): { mensaje: string; sirveReintentar: boolean } {
  switch (kind) {
    case 'NOTHING_TO_BILL':
      // La mesa está bien; simplemente no hay nada que cobrar todavía.
      return {
        mensaje: 'Todavía no hay nada para cobrar en esta mesa.',
        sirveReintentar: false,
      };
    case 'NOT_FOUND':
      // La comida terminó, o el mozo cerró la mesa desde el salón. Reintentar
      // repetiría el mismo fallo para siempre.
      return {
        mensaje: 'Esta mesa ya se cerró. Escaneá el QR de nuevo para volver a entrar.',
        sirveReintentar: false,
      };
    case 'INVALID_TABLE_TOKEN':
    case 'WRONG_TABLE':
      return {
        mensaje: 'El código de la mesa venció. Escaneá el QR otra vez.',
        sirveReintentar: false,
      };
    default:
      // Un problema del servidor no es algo que el comensal pueda resolver:
      // el mozo sí, y está a unos metros. Pero puede ser pasajero, así que
      // volver a intentar tiene sentido.
      return {
        mensaje:
          status >= 500
            ? 'No pudimos abrir la cuenta. Avisale al mozo.'
            : 'No pudimos abrir la cuenta. Probá de nuevo en un momento.',
        sirveReintentar: true,
      };
  }
}

@Injectable({ providedIn: 'root' })
export class BillStore {
  private readonly api = inject(ApiClient);

  readonly bill = signal<BillDto | null>(null);
  readonly split = signal<SplitDto | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  /**
   * Si el botón de reintentar puede llegar a servir.
   *
   * Una mesa cerrada no se arregla tocando de nuevo: lo que hace falta es
   * escanear el QR. Ofrecer el botón igual invita a repetir un fallo que ya se
   * sabe que se va a repetir.
   */
  readonly sirveReintentar = signal(true);

  async close(sessionId: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.sirveReintentar.set(true);

    try {
      const response = await this.api.fetch(`/bills/close/${sessionId}`, { method: 'POST' });
      if (!response.ok) {
        // El servidor dice por qué; sin leerlo, tres problemas muy distintos
        // —la mesa no pidió nada, la sesión venció, el QR ya no vale— salían
        // con el mismo "no pudimos abrir la cuenta", que no le dice a nadie
        // qué hacer a continuación.
        const detalle = (await response.json().catch(() => null)) as { kind?: string } | null;
        const porQue = porQueNoAbre(detalle?.kind, response.status);
        this.error.set(porQue.mensaje);
        this.sirveReintentar.set(porQue.sirveReintentar);
        return;
      }
      this.bill.set((await response.json()) as BillDto);
    } catch {
      // Sin señal es lo más pasajero de todo: reintentar es exactamente lo
      // que corresponde.
      this.error.set('Sin conexión. Probá de nuevo.');
    } finally {
      this.busy.set(false);
    }
  }

  async load(sessionId: string, display: string): Promise<void> {
    try {
      const response = await this.api.fetch(`/bills/${sessionId}?display=${display}`);
      if (!response.ok) {
        // Un fallo silencioso dejaba la cuenta anterior en pantalla, con los
        // montos en la moneda que no se eligió: parecía que el cambio no había
        // hecho nada, y el comensal lo volvía a tocar.
        this.error.set('No pudimos mostrar la cuenta en esa moneda');
        return;
      }
      this.bill.set((await response.json()) as BillDto);
      this.error.set(null);
    } catch {
      this.error.set('Sin conexión');
    }
  }

  /**
   * Marks the bill paid, freezing it.
   *
   * Until this lands the bill keeps re-reading the table, so anything ordered
   * after asking for it still gets charged.
   */
  // Cerrar la cuenta salió de acá: la API lo pide con permiso `orders:advance`
  // y este teléfono nunca lo tiene. Lo hace el mozo desde salón, después de
  // cobrar; desde el comensal sale el aviso, que es una llamada a la mesa.

  /**
   * Borra la división a medio hacer.
   *
   * Mientras el comensal está eligiendo quién paga qué no hay división válida
   * que mostrar, y dejar la anterior en pantalla sería mostrar montos que ya
   * no corresponden a lo que está marcado.
   */
  clearSplit(): void {
    this.split.set(null);
    this.error.set(null);
  }

  /** Splits are computed server-side and never persisted, so the table can try options. */
  async computeSplit(
    sessionId: string,
    kind: SplitKind,
    parts?: number,
    assignments?: ReadonlyArray<{ lineId: string; payerIds: readonly string[] }>,
    payerId?: string,
    paymentMethod?: string,
  ): Promise<void> {
    this.error.set(null);

    const response = await this.api.send(`/bills/${sessionId}/split`, 'POST', {
      kind,
      parts,
      assignments,
      payerId,
      paymentMethod,
    });

    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as { kind?: string } | null;
      this.error.set(
        detail?.kind === 'UNASSIGNED_LINES'
          ? 'Falta decir quién paga algo'
          : detail?.kind === 'AMOUNTS_DO_NOT_MATCH'
            ? 'Los montos no suman el total'
            : 'No pudimos calcular la división',
      );
      this.split.set(null);
      return;
    }

    this.split.set((await response.json()) as SplitDto);
  }
}
