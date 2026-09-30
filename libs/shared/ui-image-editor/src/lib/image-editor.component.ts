import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import {
  type Encuadre,
  ENCUADRE_ENTERO,
  centrarDentro,
  esLaFotoEntera,
} from '@itadaki/catalog/domain';
import { medidaDeSubida } from './medida-de-subida';

/**
 * Deja la foto en la medida con la que se va a guardar, antes de subirla.
 *
 * Una foto de teléfono sale de doce megapíxeles y pesa cuatro o cinco megas.
 * Viaja en base64 —que le suma un tercio— y del otro lado el servidor la
 * decodifica entera para achicarla exactamente a esto. Haciéndolo acá, la
 * espera del dueño se va casi toda: sube medio mega en vez de seis, y el
 * servidor —que tiene una décima de procesador— se ahorra el decodificado más
 * caro de todos.
 *
 * No se recorta ni se retoca nada: es la misma foto, en menos píxeles.
 *
 * Si algo falla se manda el archivo original. Subir de más es lento; no poder
 * subir es perder la foto.
 */
async function achicarParaSubir(file: File): Promise<File> {
  try {
    // `from-image` aplica la orientación del EXIF: sin eso, una foto sacada
    // de costado se sube acostada.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const medida = medidaDeSubida(bitmap.width, bitmap.height, file.size);
    if (medida === null) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = medida.width;
    canvas.height = medida.height;

    const context = canvas.getContext('2d');
    if (context === null) {
      bitmap.close();
      return file;
    }

    context.drawImage(bitmap, 0, 0, medida.width, medida.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.9),
    );
    if (blob === null || blob.size >= file.size) return file;

    return new File([blob], file.name, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/**
 * Elegir la foto del plato y, si se quiere, qué parte se ve.
 *
 * Tuvo seis controles —nitidez, radio, desenfoque, brillo, saturación y un
 * punto de foco—; quedaron dos, que son los que hacen falta para poner un
 * plato en la carta.
 *
 * El encuadre abre en la foto entera y ahí puede quedarse: el cuadrado la
 * contiene y el servidor rellena lo que sobra. Antes no era así —el recorte
 * se tomaba contra el lado corto— y mover la foto sólo elegía qué mitad del
 * plato se perdía. Ahora acercarse es una decisión, no una pérdida.
 *
 * Lo único que se le hace al archivo antes de mandarlo es bajarlo a la medida
 * con la que el servidor lo iba a guardar igual. El recorte lo hace el
 * servidor, desde el original: acá no se rasteriza nada.
 */
@Component({
  selector: 'itd-image-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './image-editor.component.css',
  template: `
    <div class="editor">
      @if (sourceUrl(); as url) {
        <div
          class="stage"
          [class.pannable]="sePuedeMover()"
          (pointerdown)="onPointerDown($event)"
          (pointermove)="onPointerMove($event)"
          (pointerup)="endDrag($event)"
          (pointercancel)="endDrag($event)"
          (wheel)="onWheel($event)"
        >
          <img class="layer" [src]="url" [style.transform]="transform()" alt="" />
        </div>

        <!-- Dice qué se está viendo y, de paso, por qué "Aplicar" está
             apagado: esta foto ya está en la carta, y lo único que queda por
             hacer con ella es reemplazarla. -->
        @if (showingExisting()) {
          <p class="existing-note" role="status">
            Ésta es la foto guardada · subí otra para reemplazarla
          </p>
        } @else {
          <!-- El zoom como barra y no sólo con la rueda: el dueño carga la
               carta desde el teléfono tanto como desde una computadora. -->
          <div class="encuadre">
            <label class="zoom">
              <span class="zoom-rotulo">Acercar</span>
              <input
                type="range"
                min="1"
                max="3"
                step="0.02"
                [value]="zoom()"
                (input)="alZoom($event)"
              />
            </label>
            <button type="button" class="ghost mini" [disabled]="entera()" (click)="verEntera()">
              Toda la foto
            </button>
          </div>
          <p class="encuadre-pista">
            {{
              entera()
                ? 'Entra entera. Acercá si querés mostrar sólo una parte.'
                : 'Arrastrá la foto para elegir qué parte se ve.'
            }}
          </p>
        }

        <div class="actions">
          <label class="ghost file-swap">
            {{ showingExisting() ? 'Subir otra foto' : 'Cambiar foto' }}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              (change)="onFile($event)"
            />
          </label>
          <button
            type="button"
            class="primary"
            [disabled]="showingExisting() || preparando()"
            (click)="emit()"
          >
            {{ preparando() ? 'Preparando…' : 'Aplicar' }}
          </button>
        </div>
      } @else {
        <label class="dropzone">
          <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" (change)="onFile($event)" />
          <span class="dropzone-title">elegí una foto</span>
          <span class="dropzone-hint">JPG, PNG, WebP o AVIF · hasta 15 MB</span>
        </label>
      }
    </div>
  `,
})
export class ImageEditorComponent {
  /** Changing this clears the editor: a new dish must not inherit the last photo. */
  readonly subjectId = input<string>('');

  /** Photo the subject already has, shown so the editor opens on real content. */
  readonly existingUrl = input<string | null>(null);

  readonly applied = output<{ file: File; encuadre: Encuadre }>();

  protected readonly sourceUrl = signal<string | null>(null);
  /** Mientras se achica la foto: son unos segundos en un teléfono viejo. */
  protected readonly preparando = signal(false);
  /** True while showing the stored photo: there is nothing to apply. */
  protected readonly showingExisting = signal(false);

  /**
   * El encuadre elegido, en coordenadas de la foto.
   *
   * Se guarda así y no como una transformación de pantalla: es lo que viaja al
   * servidor, y tenerlo en una sola forma evita convertir de ida y de vuelta
   * cada vez que alguien arrastra.
   */
  private readonly encuadre = signal<Encuadre>(ENCUADRE_ENTERO);
  /** Medidas de la foto cargada; sin ellas no se sabe qué se está mirando. */
  private readonly medida = signal({ width: 1, height: 1 });

  protected readonly zoom = computed(() => 1 / this.encuadre().lado);
  protected readonly entera = computed(() => esLaFotoEntera(this.encuadre()));

  /** Si hay adónde arrastrar: con la foto entera, no. */
  protected readonly sePuedeMover = computed(() => !this.entera());

  /**
   * Cómo se ve el encuadre en pantalla.
   *
   * El cuadro mide lo mismo que el lado más largo de la foto a zoom 1, así que
   * acercarse es escalar, y correr el centro es trasladar en fracción de ese
   * lado más largo.
   */
  protected readonly transform = computed(() => {
    const { cx, cy, lado } = this.encuadre();
    const { width, height } = this.medida();
    const masLargo = Math.max(width, height);
    const zoom = 1 / lado;

    const tx = ((0.5 - cx) * width * 100 * zoom) / masLargo;
    const ty = ((0.5 - cy) * height * 100 * zoom) / masLargo;

    return `translate(${tx}%, ${ty}%) scale(${zoom})`;
  });

  private file: File | null = null;
  private objectUrl: string | null = null;
  private arrastrando = false;
  private ultimoX = 0;
  private ultimoY = 0;

  constructor() {
    effect(() => {
      // Depend on both inputs so switching dishes wipes the previous photo
      // and falls back to whatever the new dish already has.
      this.subjectId();
      const existing = this.existingUrl();

      this.clear();
      if (existing !== null && existing !== '') {
        this.sourceUrl.set(existing);
        this.showingExisting.set(true);
      }
    });
  }

  /** Drops the loaded photo. */
  private clear(): void {
    if (this.objectUrl !== null) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.file = null;
    this.sourceUrl.set(null);
    this.showingExisting.set(false);
    this.verEntera();
  }

  protected onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = input.files?.[0];
    if (picked === undefined) return;

    if (this.objectUrl !== null) {
      URL.revokeObjectURL(this.objectUrl);
    }

    this.file = picked;
    const url = URL.createObjectURL(picked);
    this.objectUrl = url;
    this.sourceUrl.set(url);
    this.showingExisting.set(false);
    this.verEntera();
    void this.leerMedida(url);
  }

  /** Vuelve al encuadre de arranque: la foto entera. */
  protected verEntera(): void {
    this.encuadre.set(ENCUADRE_ENTERO);
  }

  protected alZoom(event: Event): void {
    const valor = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(valor) || valor <= 0) return;
    this.acercar(1 / valor);
  }

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    this.acercar(this.encuadre().lado + Math.sign(event.deltaY) * 0.04);
  }

  protected onPointerDown(event: PointerEvent): void {
    if (!this.sePuedeMover()) return;
    this.arrastrando = true;
    this.ultimoX = event.clientX;
    this.ultimoY = event.clientY;
    (event.target as Element).setPointerCapture?.(event.pointerId);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.arrastrando) return;

    const caja = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (caja.width === 0 || caja.height === 0) return;

    const { width, height } = this.medida();
    const actual = this.encuadre();
    const masLargo = Math.max(width, height);

    // Un píxel de pantalla son `lado` píxeles de foto: el cuadro muestra
    // `lado × masLargo` de la foto en `caja.width` de pantalla.
    const porPixel = (actual.lado * masLargo) / caja.width;

    this.mover({
      ...actual,
      cx: actual.cx - ((event.clientX - this.ultimoX) * porPixel) / width,
      cy: actual.cy - ((event.clientY - this.ultimoY) * porPixel) / height,
    });

    this.ultimoX = event.clientX;
    this.ultimoY = event.clientY;
  }

  protected endDrag(event: PointerEvent): void {
    this.arrastrando = false;
    (event.target as Element).releasePointerCapture?.(event.pointerId);
  }

  private acercar(lado: number): void {
    // Un tercio de la foto es lo más cerca que se puede ir: más que eso, en la
    // carta se ve un pedazo de salsa que no se reconoce.
    this.mover({ ...this.encuadre(), lado: Math.min(1, Math.max(1 / 3, lado)) });
  }

  /** Todo cambio pasa por acá, así el encuadre nunca sale de la foto. */
  private mover(encuadre: Encuadre): void {
    const { width, height } = this.medida();
    this.encuadre.set(centrarDentro(encuadre, width, height));
  }

  /** La proporción de la foto, que es lo que decide hasta dónde se arrastra. */
  private async leerMedida(url: string): Promise<void> {
    const image = new Image();
    image.src = url;

    try {
      await image.decode();
    } catch {
      // Sin medidas queda 1×1: el encuadre entero sigue siendo correcto y lo
      // único que se pierde es poder acercarse.
      return;
    }

    if (image.naturalWidth > 0 && image.naturalHeight > 0) {
      this.medida.set({ width: image.naturalWidth, height: image.naturalHeight });
    }
  }

  protected async emit(): Promise<void> {
    const file = this.file;
    if (file === null) return;

    this.preparando.set(true);
    try {
      this.applied.emit({ file: await achicarParaSubir(file), encuadre: this.encuadre() });
    } finally {
      this.preparando.set(false);
    }
  }
}
