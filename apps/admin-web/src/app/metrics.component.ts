import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { MEDIOS_QUE_ELIGE_EL_MOZO, nombreDelMedio } from '@itadaki/billing/domain';
import { AuthStore } from '@itadaki/shared/ui-auth';
import { conciliar } from './conciliar-lo-facturado';

interface MoneyDto {
  readonly amountInMinorUnits: number;
  readonly currency: string;
}

interface ProductStat {
  readonly productId: string;
  readonly name: string;
  readonly unitsSold: number;
  readonly revenue: MoneyDto;
}

/**
 * Lo que entró con cada medio de pago.
 *
 * Lo declara el mozo al cerrar la mesa, no la mesa al pedir la cuenta: el
 * comensal dice cómo *piensa* pagar antes de que el mozo llegue, y eso cambia.
 * Un número que el dueño cruza con su caja tiene que venir de quien tuvo la
 * plata en la mano.
 */
export interface CobroDto {
  /** `null` en las cuentas que se cobraron sin declarar con qué. */
  readonly medio: string | null;
  readonly cuentas: number;
  readonly cobrado: MoneyDto;
  readonly descuento: MoneyDto;
}

export interface MetricsDto {
  readonly windowDays: number;
  readonly orders: number;
  readonly averageTicket: MoneyDto | null;
  readonly medianPrepMinutes: number | null;
  readonly ordersByHour: readonly number[];
  readonly cancelled: number;
  readonly cobros: readonly CobroDto[];
  readonly topProducts: readonly ProductStat[];
  readonly bottomProducts: readonly ProductStat[];
}

/**
 * Los períodos que se pueden mirar.
 *
 * "Hoy" primero porque es el que se mira todos los días: el dueño cierra la
 * caja y quiere cuadrarla contra lo que dice el sistema. Los otros tres son
 * para mirar cómo viene el mes, que se hace de vez en cuando.
 *
 * No es "1 día": las últimas veinticuatro horas incluirían el servicio de
 * anoche, que fue otro turno con otra caja. Va como palabra y no como número
 * justamente para que no se confundan.
 */
const WINDOWS: ReadonlyArray<{ days: number | 'hoy'; label: string }> = [
  { days: 'hoy', label: 'Hoy' },
  { days: 7, label: '7 días' },
  { days: 30, label: '30 días' },
  { days: 90, label: '90 días' },
];

/**
 * What sold, for the person who runs the place.
 *
 * Headline numbers first and one chart, rather than a wall of plots: this is
 * read on a phone between services, and the questions are "how fue" and "qué se
 * vende" — not exploratory analysis.
 */
@Component({
  selector: 'itd-metrics',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './metrics.component.css',
  template: `
    <section class="panel">
      <header class="head">
        <h2 class="title">Cómo viene el negocio</h2>
        <div class="windows" role="group" aria-label="Período">
          @for (option of windows; track option.days) {
            <button
              type="button"
              class="window"
              [attr.aria-pressed]="days() === option.days"
              (click)="setWindow(option.days)"
            >
              {{ option.label }}
            </button>
          }
        </div>
      </header>

      @if (data(); as m) {
        @if (m.orders === 0) {
          <p class="empty">
            Todavía no hay pedidos en este período. Cuando empiecen a llegar,
            vas a ver acá cuánto vendiste y qué se pide más.
          </p>
        } @else {
          <!-- Headline numbers, not one-bar charts. -->
          <div class="tiles">
            <div class="tile">
              <span class="tile-label">Pedidos</span>
              <span class="tile-value">{{ m.orders }}</span>
            </div>
            <div class="tile">
              <span class="tile-label">Ticket promedio</span>
              <span class="tile-value">{{ money(m.averageTicket) }}</span>
            </div>
            <div class="tile">
              <span class="tile-label">Facturado</span>
              <span class="tile-value">{{ money(totalRevenue()) }}</span>
            </div>
            <div class="tile">
              <span class="tile-label">Cocina</span>
              <span class="tile-value">{{ prepLabel(m.medianPrepMinutes) }}</span>
            </div>
          </div>

          @if (m.cancelled > 0) {
            <p class="cancelled">
              {{ m.cancelled }} pedido{{ m.cancelled > 1 ? 's' : '' }} cancelado{{
                m.cancelled > 1 ? 's' : ''
              }}
              en el período.
            </p>
          }

          <!-- Cómo entró la plata.
               Va aparte de los pedidos porque mide otra cosa: los pedidos
               cuentan lo que salió de la cocina, esto lo que entró en la caja.
               Y separado por medio porque no cuestan lo mismo: el crédito
               cobra más comisión que el débito y se acredita más tarde, la
               transferencia entra casi entera pero se concilia a mano. -->
          @if (cobros().length > 0) {
            <h3 class="section-title">Cómo te pagaron</h3>
            <ul class="cobros">
              @for (cobro of cobros(); track cobro.medio) {
                <li class="cobro-row">
                  <span class="cobro-medio">{{ nombreDelMedio(cobro.medio) }}</span>
                  <span class="cobro-monto">{{ money(cobro.cobrado) }}</span>
                  <span class="cobro-cuentas">
                    {{ cobro.cuentas }} cuenta{{ cobro.cuentas > 1 ? 's' : '' }}
                    @if (cobro.descuento.amountInMinorUnits > 0) {
                      · {{ money(cobro.descuento) }} de descuento
                    }
                  </span>
                </li>
              }
            </ul>
            <!-- La cuenta completa, a la vista.
                 Facturado y cobrado miden cosas distintas y nunca dan igual;
                 mostrarlos uno al lado del otro sin explicar el hueco se lee
                 como plata que desapareció, y quien mira esto lo cruza con su
                 caja. -->
            @if (conciliacion(); as detalle) {
              <p class="cobros-cuenta">
                De {{ money(detalle.facturado) }} facturados:
                <strong>{{ money(detalle.cobrado) }}</strong> cobrados
                @if (detalle.descuento.amountInMinorUnits > 0) {
                  · {{ money(detalle.descuento) }} de descuento
                }
                @if (detalle.sinCerrar.amountInMinorUnits > 0) {
                  · {{ money(detalle.sinCerrar) }} en mesas sin cerrar
                }
                @if (!detalle.cierra) {
                  · incluye mesas de días anteriores cobradas en este período
                }
              </p>
            }

            @if (sinDeclarar() > 0) {
              <!-- El hueco se dice, no se reparte: repartirlo a ojo entre los
                   otros medios sería inventar un número en el reporte que el
                   dueño cruza con su caja. -->
              <p class="cobros-nota">
                {{ sinDeclarar() }} cuenta{{ sinDeclarar() > 1 ? 's' : '' }} se
                cobró sin decir con qué. Al cerrar la mesa, el salón pregunta
                cómo pagaron.
              </p>
            }
          }

          <h3 class="section-title">Lo que más se vende</h3>
          <!-- One hue, length carries the value: the bars rank magnitude, they
               do not identify series, so a categorical palette would be wrong. -->
          <ul class="bars">
            @for (product of m.topProducts; track product.productId) {
              <li class="bar-row">
                <span class="bar-name">{{ product.name }}</span>
                <span class="bar-track">
                  <span
                    class="bar-fill"
                    [style.width.%]="share(product.unitsSold)"
                    [attr.aria-hidden]="true"
                  ></span>
                </span>
                <span class="bar-value">{{ product.unitsSold }}</span>
              </li>
            }
          </ul>

          @if (m.bottomProducts.length > 0 && m.topProducts.length > 3) {
            <h3 class="section-title quiet">Lo que menos sale</h3>
            <ul class="bars">
              @for (product of m.bottomProducts; track product.productId) {
                <li class="bar-row">
                  <span class="bar-name">{{ product.name }}</span>
                  <span class="bar-track">
                    <span
                      class="bar-fill quiet"
                      [style.width.%]="share(product.unitsSold)"
                      [attr.aria-hidden]="true"
                    ></span>
                  </span>
                  <span class="bar-value">{{ product.unitsSold }}</span>
                </li>
              }
            </ul>
          }

          @if (busiestHour() !== null) {
            <p class="hour-note">
              La hora más movida es alrededor de las <strong>{{ busiestHour() }}:00</strong>.
            </p>
          }

          <!-- Identity never rests on colour alone: the same numbers, readable. -->
          <details class="table-view">
            <summary>Ver como tabla</summary>
            <table>
              <caption class="itd-visually-hidden">
                Productos vendidos {{ elPeriodo() }}
              </caption>
              <thead>
                <tr><th scope="col">Plato</th><th scope="col">Unidades</th><th scope="col">Facturado</th></tr>
              </thead>
              <tbody>
                @for (product of allProducts(); track product.productId) {
                  <tr>
                    <td>{{ product.name }}</td>
                    <td>{{ product.unitsSold }}</td>
                    <td>{{ money(product.revenue) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </details>
        }
      } @else if (error() !== null) {
        <p class="empty error" role="alert">{{ error() }}</p>
      } @else {
        <p class="empty">Cargando…</p>
      }
    </section>
  `,
})
export class MetricsComponent {
  readonly apiUrl = input.required<string>();

  private readonly auth = inject(AuthStore);

  protected readonly windows = WINDOWS;

  /** El período, dicho como se lee dentro de una frase. */
  protected readonly elPeriodo = computed(() => {
    const elegido = this.days();
    return elegido === 'hoy' ? 'hoy' : `en los últimos ${elegido} días`;
  });
  /**
   * Hoy, que es lo que se mira todos los días.
   *
   * El dueño cierra la caja y quiere cuadrarla contra lo que dice el sistema;
   * la semana y el mes se miran de vez en cuando y se eligen a mano. Antes
   * arrancaba en siete días y ver el día de hoy no era posible.
   */
  protected readonly days = signal<number | 'hoy'>('hoy');
  protected readonly data = signal<MetricsDto | null>(null);
  protected readonly error = signal<string | null>(null);

  /** Scales bars against the best seller, so the top bar always fills the track. */
  private readonly peak = computed(() =>
    Math.max(1, ...(this.data()?.topProducts ?? []).map((product) => product.unitsSold)),
  );

  /**
   * Los medios ordenados por lo que entró con cada uno.
   *
   * De mayor a menor y no en el orden en que los devuelve la base: el dueño
   * mira esto para saber por dónde le entra la plata, y esa respuesta tiene
   * que estar en la primera línea.
   *
   * Las cuentas sin declarar quedan afuera de la lista: se dicen aparte, en
   * una nota, porque no son un medio de pago sino un dato que falta.
   */
  protected readonly cobros = computed<readonly CobroDto[]>(() => {
    const llegados = [...(this.data()?.cobros ?? [])].filter((cobro) => cobro.medio !== null);

    /*
     * Los cuatro medios siempre, aunque alguno esté en cero.
     *
     * Antes se listaban sólo los que habían tenido cobros, así que un medio
     * sin usar no aparecía — y no se distinguía "nadie pagó con transferencia"
     * de "el sistema no lo está midiendo". Justamente lo que el dueño mira
     * acá es cuánto entra por cada uno, y un cero es una respuesta.
     */
    const moneda = llegados[0]?.cobrado.currency ?? 'ARS';
    const vacio = (medio: string): CobroDto => ({
      medio,
      cuentas: 0,
      cobrado: { amountInMinorUnits: 0, currency: moneda },
      descuento: { amountInMinorUnits: 0, currency: moneda },
    });

    const completos = [
      ...llegados,
      ...MEDIOS_QUE_ELIGE_EL_MOZO.filter(
        (medio) => !llegados.some((cobro) => cobro.medio === medio),
      ).map(vacio),
    ];

    // De mayor a menor: el dueño mira esto para saber por dónde le entra la
    // plata, y esa respuesta tiene que estar en la primera línea.
    return completos.sort(
      (a, b) => b.cobrado.amountInMinorUnits - a.cobrado.amountInMinorUnits,
    );
  });

  /**
   * De dónde sale cada peso entre lo facturado y lo cobrado.
   *
   * Null cuando todavía no hay datos, para no dibujar una cuenta de ceros.
   */
  protected readonly conciliacion = computed(() => {
    const facturado = this.totalRevenue();
    const cobros = this.data()?.cobros;
    if (facturado === null || cobros === undefined || cobros.length === 0) return null;

    const moneda = facturado.currency;
    const detalle = conciliar(facturado.amountInMinorUnits, cobros);
    const enPlata = (minor: number): MoneyDto => ({ amountInMinorUnits: minor, currency: moneda });

    return {
      facturado,
      cobrado: enPlata(detalle.cobrado),
      descuento: enPlata(detalle.descuento),
      sinCerrar: enPlata(detalle.sinCerrar),
      cierra: detalle.cierra,
    };
  });

  /** Cuántas cuentas se cobraron sin que nadie dijera con qué. */
  protected readonly sinDeclarar = computed<number>(
    () => (this.data()?.cobros ?? []).find((cobro) => cobro.medio === null)?.cuentas ?? 0,
  );

  /** El mismo nombre que ve el mozo en el salón. */
  protected readonly nombreDelMedio = nombreDelMedio;

  protected readonly totalRevenue = computed<MoneyDto | null>(() => {
    const current = this.data();
    if (current === null) return null;

    const all = [...current.topProducts, ...current.bottomProducts];
    // Top and bottom can overlap when there are few products; count each once.
    const seen = new Map(all.map((product) => [product.productId, product]));
    const total = [...seen.values()].reduce(
      (sum, product) => sum + product.revenue.amountInMinorUnits,
      0,
    );
    return { amountInMinorUnits: total, currency: current.averageTicket?.currency ?? 'ARS' };
  });

  protected readonly allProducts = computed<readonly ProductStat[]>(() => {
    const current = this.data();
    if (current === null) return [];

    const seen = new Map(
      [...current.topProducts, ...current.bottomProducts].map((product) => [
        product.productId,
        product,
      ]),
    );
    return [...seen.values()].sort((a, b) => b.unitsSold - a.unitsSold);
  });

  protected readonly busiestHour = computed<number | null>(() => {
    const hours = this.data()?.ordersByHour ?? [];
    const best = hours.reduce((top, count, hour) => (count > (hours[top] ?? 0) ? hour : top), 0);
    return (hours[best] ?? 0) > 0 ? best : null;
  });

  constructor() {
    // En el constructor las entradas todavía no llegaron: `apiUrl()` no tiene
    // valor y la primera carga salía contra una dirección inventada. Fallaba,
    // nadie miraba la respuesta, y la pantalla se quedaba en "Cargando…" para
    // siempre — hasta que alguien tocaba un rango y disparaba una carga que
    // esta vez sí tenía la dirección.
    //
    // Con un efecto la consulta se rehace sola cuando cambia la dirección o el
    // rango, que son las dos únicas cosas de las que depende.
    effect(() => {
      const base = this.apiUrl();
      const days = this.days();
      void this.load(base, days);
    });
  }

  protected setWindow(days: number | 'hoy'): void {
    this.days.set(days);
  }

  private async load(base: string, days: number | 'hoy'): Promise<void> {
    this.error.set(null);

    try {
      const response = await this.auth.apiFetch(`${base}/metrics?days=${days}`, {
        headers: this.auth.headers(),
      });

      if (!response.ok) {
        // Antes se descartaba en silencio: sin números y sin motivo, la
        // pantalla no se distinguía de una que todavía está cargando.
        this.error.set('No pudimos traer los números. Probá de nuevo.');
        return;
      }

      this.data.set((await response.json()) as MetricsDto);
    } catch {
      this.error.set('Sin conexión con el servidor.');
    }
  }

  protected share(units: number): number {
    return Math.max(4, Math.round((units / this.peak()) * 100));
  }

  protected money(amount: MoneyDto | null): string {
    if (amount === null) return '—';
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: amount.currency,
      maximumFractionDigits: 0,
    }).format(amount.amountInMinorUnits / 100);
  }

  /** Sub-minute values are noise from a fast test kitchen, not a real figure. */
  protected prepLabel(minutes: number | null): string {
    if (minutes === null) return '—';
    return minutes < 1 ? '<1 min' : `${Math.round(minutes)} min`;
  }
}
