import { apiUrl } from '@itadaki/shared/domain';
import {
  ChangeDetectionStrategy,
  Component,
  type OnDestroy,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  MEDIOS_QUE_ELIGE_EL_MOZO,
  type MedioDeCobro,
  nombreDelMedio,
} from '@itadaki/billing/domain';
import { type PlatoJunto, juntarIguales } from '@itadaki/ordering/domain';
import { AuthStore, LoginComponent } from '@itadaki/shared/ui-auth';
import { FloorStore, type CallDto, type Pickup, type UnsettledDto } from './floor.store';

const API_URL = apiUrl();

/** What the table asked for, in the words a waiter would use. */
const CALL_LABELS: Record<string, string> = {
  WAITER: 'Necesita al mozo',
  BILL: 'Pide la cuenta',
  QUESTION: 'Tiene una duda',
};

/**
 * A partir de acá, quien espera hace rato.
 *
 * Diez minutos con la mano levantada es el punto donde el cliente deja de
 * esperar y empieza a impacientarse. Antes de eso la ficha se ve como
 * cualquier otra; después se marca, porque el orden por sí solo no alcanza:
 * en una lista de dieciséis, la primera y la novena se ven igual.
 */
const ESPERA_LARGA_MIN = 10;

/** Y acá ya es un problema: alguien lleva un cuarto de hora esperando. */
const ESPERA_CRITICA_MIN = 15;

/**
 * Cuántas se marcan como críticas, como mucho.
 *
 * Un umbral fijo funciona con el salón tranquilo y se rompe con el salón
 * lleno: si hace veinte minutos que nadie da abasto, las dieciséis fichas
 * cruzan los quince minutos, se pintan todas, y la pantalla vuelve a decir lo
 * mismo que si no dijera nada. Marcar sólo las peores mantiene la señal:
 * siempre se puede ver a quién atender primero, tranquilo o desbordado.
 */
const CUANTAS_CRITICAS = 3;

/** Y lo mismo para el nivel de aviso, que puede tapar la pantalla igual. */
const CUANTAS_LARGAS = 6;

/**
 * The waiter's screen.
 *
 * Separate from the kitchen display because the jobs are different: a cook
 * stands at a station watching tickets, a waiter walks the room with a phone
 * answering people. Calls used to land on the kitchen board, where nobody was
 * going to walk over to the table.
 *
 * Tres carriles con el mismo peso —quién llama, qué hay que llevar, a quién
 * cobrarle— porque son las tres cosas que el mozo hace y ninguna manda sobre
 * las otras. En el teléfono se apilan en ese orden; en la tablet van uno al
 * lado del otro, que es como se mira un salón: de un vistazo, no scrolleando.
 */
@Component({
  selector: 'itd-floor',
  standalone: true,
  imports: [LoginComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './floor.component.css',
  template: `
    @if (!auth.ready()) {
      <p class="booting">Cargando…</p>
    } @else if (!auth.signedIn()) {
      <itd-login context="Salón" [entraConMail]="false" />
    } @else {
      <!--
        La barra de arriba: dónde estoy parado y si la pantalla está viva.

        Se queda pegada arriba porque el estado de conexión tiene que poder
        consultarse en cualquier momento: si el salón dejó de actualizarse, lo
        que se ve es mentira, y eso hay que poder verlo sin volver al principio.
      -->
      <header class="barra">
        <div class="marca">
          <h1 class="titulo">Salón</h1>
          @if (quien(); as nombre) {
            <p class="quien">{{ nombre }}</p>
          }
        </div>

        <div class="barra-estado">
          <p class="vivo" [class.caido]="!store.connected()" role="status">
            <span class="punto" aria-hidden="true"></span>
            <span class="vivo-texto">{{
              store.connected() ? 'En vivo' : 'Reconectando…'
            }}</span>
          </p>
          @if (store.pending(); as sinEnviar) {
            <!-- Los toques están guardados; salen solos cuando vuelve la señal. -->
            <p class="cola" role="status">{{ sinEnviar }} sin enviar</p>
          }
          <button type="button" class="salir" (click)="auth.signOut()">Salir</button>
        </div>
      </header>

      <!--
        Qué mesas estoy mirando.

        Sin esto el salón filtraba en silencio, y "nadie está llamando" no
        distinguía entre un salón tranquilo y una pantalla recortada.
      -->
      @if (store.misMesas().length > 0) {
        <section class="turno" [class.filtrado]="!store.viendoTodo()">
          <div class="turno-texto">
            <span class="turno-estado">
              {{ store.viendoTodo() ? 'Todo el salón' : 'Solo tus mesas' }}
            </span>
            <span class="turno-mesas">
              @for (id of store.misMesas(); track id) {
                <span class="turno-mesa">{{ tableNumber(id) }}</span>
              }
            </span>
          </div>
          <button
            type="button"
            class="turno-cambiar"
            (click)="store.viendoTodo.set(!store.viendoTodo())"
          >
            {{ store.viendoTodo() ? 'Ver solo las mías' : 'Ver todo' }}
          </button>
        </section>
      }

      <!--
        Cobrar y liberar fallaban en silencio: el mozo tocaba, no pasaba nada,
        y no sabía si el toque había entrado.
      -->
      @if (store.actionError(); as problema) {
        <p class="error" role="alert">
          <span>{{ problema }}</span>
          <button type="button" class="error-cerrar" (click)="store.actionError.set(null)">
            Entendido
          </button>
        </p>
      }

      <!--
        Los tres carriles.

        Mismo ancho y mismo peso: ninguno es más importante que otro, y cuál
        apura depende del momento. Cada uno dice cuántos tiene en el encabezado,
        así se sabe qué falta sin recorrerlo.
      -->
      <div class="carriles">
        <!-- 1. Quién levantó la mano. Una persona esperando gana sobre un
             plato en el pase: el plato se enfría, la persona se va. -->
        <section class="carril" aria-labelledby="carril-llamados">
          <header class="carril-head">
            <h2 class="carril-titulo" id="carril-llamados">Te llaman</h2>
            @if (store.misLlamados().length > 0) {
              <span class="carril-cuenta urgente">{{ store.misLlamados().length }}</span>
            }
          </header>

          <div class="carril-cuerpo">
            @for (call of store.misLlamados(); track call.id) {
              <article
                class="ficha llamado itd-rise"
                [class.espera-larga]="marcadas().largas.has(call.id)"
                [class.espera-critica]="marcadas().criticas.has(call.id)"
              >
                <!--
                  El número de mesa es lo único que el mozo busca para saber a
                  dónde caminar, así que va solo y grande, sin la palabra
                  "Mesa" repetida dieciséis veces.
                -->
                <span class="ficha-mesa" [attr.aria-label]="'Mesa ' + tableNumber(call.tableId)">
                  {{ tableNumber(call.tableId) }}
                </span>

                <div class="ficha-datos">
                  <span class="ficha-que">{{ label(call.reason) }}</span>

                  <!-- Los avisos que cambian lo que hay que llevar o hacer. -->
                  <span class="ficha-marcas">
                    @if (call.needsCardReader) {
                      <span class="marca posnet">Llevá el posnet</span>
                    } @else if (call.paysAtCounter) {
                      <!-- El caso que más se escapa: nadie cobra en la mesa, así
                           que el sistema no se entera de si pagaron. Sin este
                           aviso la mesa queda ocupada por gente que ya se fue, o
                           se libera una que todavía no pasó por la caja. -->
                      <span class="marca caja">Pagan en caja</span>
                    } @else if (call.paymentMethod === 'CASH') {
                      <span class="marca efectivo">Efectivo</span>
                    }
                  </span>

                  @if (call.note !== '') {
                    <span class="ficha-nota">"{{ call.note }}"</span>
                  }
                </div>

                <div class="ficha-accion">
                  <span class="espera">{{ waitedSince(call.raisedAt) }}</span>
                  <button type="button" class="boton principal" (click)="attend(call)">
                    Voy
                  </button>
                </div>
              </article>
            } @empty {
              <p class="vacio">Nadie está llamando.</p>
            }
          </div>
        </section>

        <!-- 2. Lo que está listo y nadie llevó. Una tarjeta por mesa, no por
             plato: es un viaje. -->
        <section class="carril" aria-labelledby="carril-pase">
          <header class="carril-head">
            <h2 class="carril-titulo" id="carril-pase">Listo para llevar</h2>
            @if (store.pickups().length > 0) {
              <span class="carril-cuenta listo">{{ store.pickups().length }}</span>
            }
          </header>

          <div class="carril-cuerpo">
            @for (mesa of store.pickupsByTable(); track mesa.tableId) {
              <article class="ficha viaje itd-rise">
                <span class="ficha-mesa" [attr.aria-label]="'Mesa ' + tableNumber(mesa.tableId)">
                  {{ tableNumber(mesa.tableId) }}
                </span>

                <div class="ficha-datos">
                  <ul class="platos">
                    @for (dish of juntos(mesa.dishes); track dish.ids[0]!.id) {
                      <li class="plato">
                        <span class="plato-cuanto">{{ dish.quantity }}</span>
                        <span class="plato-nombre">{{ dish.name }}</span>
                        @if (dish.notes !== '') {
                          <span class="ficha-nota">"{{ dish.notes }}"</span>
                        }
                      </li>
                    }
                  </ul>
                </div>

                <div class="ficha-accion">
                  <button
                    type="button"
                    class="boton principal"
                    (click)="deliverTable(mesa.dishes)"
                  >
                    Llevé
                  </button>
                </div>
              </article>
            } @empty {
              <p class="vacio">Nada esperando en la barra.</p>
            }
          </div>
        </section>

        <!--
          3. Quién debe plata.

          Deber no es pedir la cuenta: una mesa que acaba de comer debe y sigue
          sentada. El color de alarma se guarda para cuando de verdad piden.
        -->
        <section class="carril" aria-labelledby="carril-cobro">
          <header class="carril-head">
            <h2 class="carril-titulo" id="carril-cobro">Por cobrar</h2>
            @if (store.misImpagas().length > 0) {
              <span class="carril-cuenta cobro">{{ store.misImpagas().length }}</span>
            }
          </header>

          <div class="carril-cuerpo">
            @for (mesa of store.misImpagas(); track mesa.sessionId) {
              <article
                class="ficha cobrar itd-rise"
                [class.piden]="store.pidieronLaCuenta().has(mesa.sessionId)"
                [class.abierta]="cobrando() === mesa.sessionId || confirming() === mesa.sessionId"
              >
                <span class="ficha-mesa" [attr.aria-label]="'Mesa ' + tableNumber(mesa.tableId)">
                  {{ tableNumber(mesa.tableId) }}
                </span>

                <div class="ficha-datos">
                  <span class="ficha-monto">{{ money(mesa.owed) }}</span>
                  <span class="ficha-marcas">
                    <span class="marca gente">{{ mesa.diners }} en la mesa</span>
                    @if (store.pidieronLaCuenta().has(mesa.sessionId)) {
                      <span class="marca piden">Pidieron la cuenta</span>
                    }
                    @if (store.payingAtCounter().has(mesa.sessionId)) {
                      <!-- Acá se decide liberar, así que el aviso va acá: en la
                           lista de llamados se pierde entre los otros. -->
                      <span class="marca caja">Pagan en caja</span>
                    }
                  </span>
                  @if (mesa.descuento !== null) {
                    <!--
                      Cuánto sale si pagan en efectivo, antes de abrir nada.

                      El local da un descuento por efectivo y la mesa declara
                      cómo piensa pagar antes de que llegue el mozo — pero eso
                      cambia en la mesa. Sin este aviso el mozo cobraba el
                      total, o restaba de memoria.
                    -->
                    <span class="ficha-efectivo">
                      En efectivo, {{ money(montoPara(mesa, 'CASH')) }}
                    </span>
                  }
                  @if (mesa.since !== null) {
                    <span class="ficha-nota">comieron {{ waitedSince(mesa.since) }}</span>
                  }
                </div>

                @if (cobrando() !== mesa.sessionId && confirming() !== mesa.sessionId) {
                  <div class="ficha-accion">
                    <button
                      type="button"
                      class="boton principal"
                      (click)="cobrando.set(mesa.sessionId)"
                    >
                      Cobré
                    </button>
                    <button
                      type="button"
                      class="boton tenue"
                      (click)="confirming.set(mesa.sessionId)"
                    >
                      Liberar
                    </button>
                  </div>
                }

                <!--
                  Elegir el medio, a lo ancho de la ficha y no en la columna de
                  la derecha: cinco medios no entran en una columna angosta, y
                  se desbordaban encima del nombre de la mesa y del monto, que
                  es justo lo que hay que leer para cobrar.

                  Lo declara quien tuvo la plata en la mano: la mesa dice cómo
                  *piensa* pagar antes de que el mozo llegue, y eso cambia.
                -->
                @if (cobrando() === mesa.sessionId) {
                  <div class="panel">
                    <p class="panel-pregunta">¿Con qué pagaron?</p>
                    <!-- Recorridos y no escritos a mano: agregar un medio en un
                         solo lugar tiene que alcanzar. Crédito y débito van
                         separados porque al dueño le cuestan distinto, y eso
                         sólo lo sabe quien pasó el posnet. -->
                    <div class="medios">
                      @for (medio of mediosDeCobro; track medio) {
                        <button
                          type="button"
                          class="medio"
                          [class.efectivo]="medio === 'CASH'"
                          (click)="charge(mesa.sessionId, medio)"
                        >
                          <span class="medio-nombre">{{ nombreDelMedio(medio) }}</span>
                          <span class="medio-monto">{{ money(montoPara(mesa, medio)) }}</span>
                        </button>
                      }
                    </div>
                    <button type="button" class="boton tenue ancho" (click)="cobrando.set(null)">
                      Volver
                    </button>
                  </div>
                }

                @if (confirming() === mesa.sessionId) {
                  <!-- Dos salidas, no un botón que cambia de texto: eso se leía
                       como un cartel sobre la deuda y no como algo que había
                       que volver a tocar. -->
                  <div class="panel">
                    <p class="panel-pregunta">¿Liberar sin cobrar {{ money(mesa.owed) }}?</p>
                    <div class="dos">
                      <button
                        type="button"
                        class="boton peligro"
                        (click)="release(mesa.sessionId)"
                      >
                        Sí, liberar
                      </button>
                      <button type="button" class="boton tenue" (click)="confirming.set(null)">
                        No
                      </button>
                    </div>
                  </div>
                }
              </article>
            } @empty {
              <p class="vacio">Nadie debe nada.</p>
            }
          </div>
        </section>
      </div>

      <!--
        Lo que se consulta, no lo que se hace.

        Abajo y plegado: son cosas que el mozo busca cuando las necesita, no
        que mira cada vez que levanta la vista.
      -->
      <div class="consulta">
        @if (store.cooking().length > 0) {
          <section class="plegable">
            <button
              type="button"
              class="plegable-head"
              [attr.aria-expanded]="showCooking()"
              (click)="showCooking.set(!showCooking())"
            >
              <span class="plegable-titulo">En cocina</span>
              <!-- Mesas y no envíos: decía "3 mesas" cuando era una sola que
                   había pedido tres veces. -->
              <span class="plegable-cuenta">
                {{ store.cocinandoPorMesa().length }}
                {{ store.cocinandoPorMesa().length === 1 ? 'mesa' : 'mesas' }}
              </span>
              <span class="chevron" [class.abierto]="showCooking()" aria-hidden="true"></span>
            </button>

            @if (showCooking()) {
              <div class="plegable-cuerpo">
                <!-- Una fila por mesa y no por envío: una mesa que pidió tres
                     veces aparecía tres veces seguidas, cada una diciendo
                     "Mesa 1" y con su propio botón. -->
                @for (mesa of store.cocinandoPorMesa(); track mesa.tableId) {
                  <div class="fila">
                    <span class="fila-mesa">{{ tableNumber(mesa.tableId) }}</span>
                    <span class="fila-texto">{{ pending(mesa.items) }}</span>
                    <!-- Para la mesa que pagó en la caja y se fue: sin esto
                         queda ocupada hasta el barrido, y el grupo siguiente
                         escanea el QR y cae en el pedido de los anteriores. -->
                    @if (confirming() === mesa.tableId) {
                      <button
                        type="button"
                        class="boton peligro chico"
                        (click)="liberarMesa(mesa.sessionIds)"
                      >
                        ¿Seguro?
                      </button>
                    } @else {
                      <button
                        type="button"
                        class="boton tenue chico"
                        (click)="confirming.set(mesa.tableId)"
                      >
                        Liberar
                      </button>
                    }
                  </div>
                }
              </div>
            }
          </section>
        }

        <!-- El código que el mozo le dice a la mesa al sentarla. Todas las
             mesas, no sólo las ocupadas: hace falta justo antes de que la mesa
             exista. -->
        @if (store.tableCodes().length > 0) {
          <section class="plegable">
            <button
              type="button"
              class="plegable-head"
              [attr.aria-expanded]="showCodes()"
              (click)="showCodes.set(!showCodes())"
            >
              <span class="plegable-titulo">Códigos de mesa</span>
              <span class="plegable-cuenta">{{ store.tableCodes().length }} mesas</span>
              <span class="chevron" [class.abierto]="showCodes()" aria-hidden="true"></span>
            </button>

            @if (showCodes()) {
              <div class="plegable-cuerpo">
                <p class="pista">
                  Decíselo a la mesa al sentarla. Se renueva solo cuando la liberás.
                </p>
                @for (mesa of store.tableCodes(); track mesa.tableId) {
                  <div class="fila">
                    <span class="fila-mesa">{{ tableNumber(mesa.tableId) }}</span>
                    <span class="fila-texto">
                      {{ mesa.diners > 0 ? mesa.diners + ' sentados' : 'libre' }}
                    </span>
                    <span class="codigo">{{ mesa.joinCode ?? '—' }}</span>
                    <!-- Para cuando se filtró: lo escucharon de la mesa de al
                         lado o quedó anotado en una servilleta. -->
                    <button
                      type="button"
                      class="boton tenue chico"
                      (click)="rotate(mesa.tableId)"
                    >
                      Renovar
                    </button>
                  </div>
                }
              </div>
            }
          </section>
        }
      </div>
    }
  `,
})
export class FloorComponent implements OnDestroy {
  protected readonly auth = inject(AuthStore);
  protected readonly store = inject(FloorStore);

  /**
   * El reloj de la pantalla.
   *
   * Las esperas envejecen solas, sin ningún evento que dispare un redibujo,
   * así que algo tiene que marcar el paso del tiempo.
   */
  private readonly tick = signal(Date.now());
  private readonly timer: ReturnType<typeof setInterval>;

  /**
   * Cuáles se marcan, y con qué fuerza.
   *
   * Dos condiciones a la vez: tiene que haber pasado el tiempo Y estar entre
   * las que más esperaron. Con el salón tranquilo manda el tiempo —una sola
   * mesa esperando doce minutos se marca igual— y con el salón desbordado
   * manda el ranking, así nunca se pintan las dieciséis.
   *
   * Devuelve dos conjuntos de ids en vez de recalcular por ficha: el template
   * los consulta una vez por fila y esto se recalcula sólo cuando cambian los
   * llamados o pasa un minuto.
   */
  protected readonly marcadas = computed(() => {
    const ahora = this.tick();
    const conEspera = this.store
      .misLlamados()
      .map((call) => ({
        id: call.id,
        minutos: Math.floor((ahora - new Date(call.raisedAt).getTime()) / 60_000),
      }))
      .sort((a, b) => b.minutos - a.minutos);

    const criticas = new Set(
      conEspera
        .filter((una) => una.minutos >= ESPERA_CRITICA_MIN)
        .slice(0, CUANTAS_CRITICAS)
        .map((una) => una.id),
    );

    const largas = new Set(
      conEspera
        .filter((una) => una.minutos >= ESPERA_LARGA_MIN)
        .slice(0, CUANTAS_LARGAS)
        .map((una) => una.id),
    );

    return { criticas, largas };
  });

  /** "En cocina" arranca plegado: es contexto, no trabajo pendiente. */
  protected readonly showCooking = signal(false);

  /** Los códigos también: se miran cuando alguien los pide, no todo el turno. */
  protected readonly showCodes = signal(false);

  /**
   * Qué mesa está esperando confirmación para liberarse.
   *
   * Un toque de más borra el pedido de gente que todavía está comiendo, así
   * que el botón pregunta antes — pero en dos toques, no con un diálogo que
   * hay que leer con la bandeja en la mano.
   */
  protected readonly confirming = signal<string | null>(null);

  /** Qué mesa está eligiendo con qué se cobró. */
  protected readonly cobrando = signal<string | null>(null);

  /** Los medios entre los que elige el mozo, efectivo primero. */
  protected readonly mediosDeCobro = MEDIOS_QUE_ELIGE_EL_MOZO;

  /** El mismo nombre que ve el dueño en sus métricas. */
  protected readonly nombreDelMedio = nombreDelMedio;

  /** Quién está trabajando, para que la pantalla no sea anónima. */
  protected readonly quien = computed(() => this.auth.profile()?.displayName ?? null);

  constructor() {
    this.auth.configure(API_URL);
    void this.auth.restore().then(() => {
      if (this.auth.signedIn()) this.store.connect();
    });

    effect(() => {
      if (this.auth.signedIn()) this.store.connect();
    });

    // Waiting times age on their own, with no event to trigger a redraw.
    this.timer = setInterval(() => this.tick.set(Date.now()), 20_000);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
    this.store.disconnect();
  }

  protected async release(sessionId: string): Promise<void> {
    this.confirming.set(null);
    await this.store.releaseTable(sessionId);
  }

  /**
   * Libera la mesa entera, con todo lo que haya pedido.
   *
   * Una mesa puede tener varias sesiones abiertas —pasa cuando el grupo se
   * suma en tandas— y liberar sólo una dejaba la mesa ocupada por las otras,
   * con el botón desapareciendo sin que nada cambiara.
   */
  protected async liberarMesa(sessionIds: readonly string[]): Promise<void> {
    this.confirming.set(null);

    // En serie y no en paralelo: son pocas, y el salón se recarga después de
    // cada una — dispararlas juntas deja al tablero pisándose a sí mismo.
    for (const sessionId of sessionIds) {
      await this.store.releaseTable(sessionId);
    }
  }

  protected async rotate(tableId: string): Promise<void> {
    await this.store.rotateCode(tableId);
  }

  /**
   * Cuánto se cobra con este medio.
   *
   * En efectivo, con el descuento del local; con cualquier otro, el total. Es
   * la misma cuenta que hace el servidor al cobrar, así que el número del
   * botón es el que queda en las métricas.
   */
  protected montoPara(
    mesa: UnsettledDto,
    medio: MedioDeCobro,
  ): { amountInMinorUnits: number; currency: string } {
    const descuento = medio === 'CASH' && mesa.descuento !== null ? mesa.descuento : null;
    return {
      amountInMinorUnits: mesa.owed.amountInMinorUnits - (descuento?.amountInMinorUnits ?? 0),
      currency: mesa.owed.currency,
    };
  }

  protected async charge(sessionId: string, cobradoCon?: MedioDeCobro): Promise<void> {
    this.confirming.set(null);
    this.cobrando.set(null);
    await this.store.chargeTable(sessionId, cobradoCon);
  }

  protected label(reason: string): string {
    return CALL_LABELS[reason] ?? reason;
  }

  /**
   * Los platos listos, con los iguales juntos.
   *
   * El mozo lleva una bandeja, no una lista de quién pidió qué: dos empanadas
   * son dos empanadas. Separadas lo obligan a contar de memoria antes de
   * salir, que es cuando menos tiempo tiene.
   */
  protected juntos(dishes: readonly Pickup[]): readonly PlatoJunto[] {
    return juntarIguales(
      dishes.map((dish) => ({
        id: dish.itemId,
        orderId: dish.orderId,
        // El salón no muestra estado ni sección: lo que llega acá ya está
        // listo, y va a la misma mesa.
        status: 'READY',
        name: dish.name,
        quantity: dish.quantity,
        notes: dish.notes,
        category: null,
      })),
    );
  }

  /** Digits first, so "mesa-7" reads as "7" across a room. */
  protected tableNumber(tableId: string): string {
    const digits = /(\d+)\s*$/.exec(tableId);
    return digits?.[1] ?? tableId;
  }

  /** Cuánto hace, en minutos, para decidir si la espera ya se nota. */
  protected minutosDesde(cuando: string): number {
    return Math.floor((this.tick() - new Date(cuando).getTime()) / 60_000);
  }

  protected waitedSince(raisedAt: string): string {
    const minutes = this.minutosDesde(raisedAt);
    return minutes < 1 ? 'recién' : `${minutes} min`;
  }

  /** El monto como lo lee un mozo cruzando el salón: sin centavos. */
  protected money(amount: { amountInMinorUnits: number; currency: string }): string {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: amount.currency,
      maximumFractionDigits: 0,
    }).format(amount.amountInMinorUnits / 100);
  }

  protected pending(items: readonly { name: string; quantity: number; status: string }[]): string {
    return items
      .filter((item) => item.status !== 'READY' && item.status !== 'DELIVERED')
      .map((item) => `${item.quantity}× ${item.name}`)
      .join(' · ');
  }

  protected async attend(call: CallDto): Promise<void> {
    await this.store.attend(call.id);
  }

  /** Un viaje entero: la mesa completa de una vez. */
  protected async deliverTable(dishes: readonly Pickup[]): Promise<void> {
    await this.store.deliverTable(dishes);
  }

  protected async deliver(dish: Pickup): Promise<void> {
    await this.store.deliver(dish.orderId, dish.itemId);
  }
}
