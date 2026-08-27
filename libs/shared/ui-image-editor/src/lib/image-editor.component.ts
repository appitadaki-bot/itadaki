import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  type ImageEditParams,
  type LumaGrid,
  proposeFrame,
} from '@itadaki/catalog/domain';

/** Downsample width for saliency analysis; detail beyond this adds cost, not accuracy. */
const ANALYSIS_WIDTH = 160;

/**
 * Recorte cuadrado: arrastrar y zoom, nada más.
 *
 * Tuvo seis controles —nitidez, radio, desenfoque, brillo, saturación y un
 * punto de foco con su propio modo—. Para poner la foto de un plato en la
 * carta hay que elegir qué parte se ve; lo demás era un editor de fotos
 * adentro de un ABM, y cada control extra era una decisión más antes de poder
 * guardar.
 *
 * Acá no se rasteriza nada: se emiten las coordenadas del recorte y el
 * servidor vuelve a renderizar desde el original intacto.
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
          [class.pannable]="canPan()"
          #stage
          (pointerdown)="onPointerDown($event)"
          (pointermove)="onPointerMove($event)"
          (pointerup)="endDrag()"
          (pointercancel)="endDrag()"
          (wheel)="onWheel($event)"
        >
          <img class="layer base" [src]="url" [style.transform]="transform()" alt="" />

          <div class="grid" aria-hidden="true"></div>
        </div>

        @if (showingExisting()) {
          <p class="existing-note" role="status">
            Foto actual de este plato · elegí otra para reemplazarla
          </p>
        } @else if (autoFramed()) {
          <p class="auto-note" role="status">Encuadre sugerido automáticamente · movelo si querés</p>
        }
        <p class="hint">
          @if (canPan()) {
            Arrastrá la foto para encuadrarla · rueda para hacer zoom
          } @else {
            Hacé zoom para poder mover el encuadre
          }
        </p>

        @if (showingExisting()) {
          <!--
            Sin esto el botón quedaba gris sin motivo visible: la foto se podía
            arrastrar y hacer zoom en pantalla, pero aplicar no hacía nada y
            nada explicaba por qué.
          -->
          <p class="editor-nota">
            Ésta es la foto guardada. Para recortarla de nuevo, subila otra vez.
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
          <button type="button" class="ghost" (click)="reset()">Restablecer</button>
          <button type="button" class="primary" [disabled]="showingExisting()" (click)="emit()">
            Aplicar
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

  readonly applied = output<{ params: ImageEditParams; file: File }>();

  private readonly stage = viewChild<ElementRef<HTMLElement>>('stage');

  protected readonly sourceUrl = signal<string | null>(null);
  protected readonly autoFramed = signal(false);
  /** True while showing the stored photo: applying needs a fresh file. */
  protected readonly showingExisting = signal(false);
  /** Natural aspect ratio of the loaded photo; drives how far it can pan. */
  private readonly aspect = signal(1);

  protected readonly zoom = signal(1);
  protected readonly offsetX = signal(0);
  protected readonly offsetY = signal(0);

  private file: File | null = null;
  private objectUrl: string | null = null;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  protected readonly transform = computed(
    () => `translate(${this.offsetX()}%, ${this.offsetY()}%) scale(${this.zoom()})`,
  );

  /**
   * How far the photo may travel, in percent of the stage, per axis.
   *
   * The stage is square and the image is `object-fit: cover`, so a landscape
   * photo already overflows sideways before any zoom is applied. Deriving the
   * limit from zoom alone pinned the image at zoom 1 — there was real overflow
   * to explore and dragging did nothing.
   */
  private readonly panLimits = computed(() => {
    const ratio = this.aspect();
    const zoom = this.zoom();

    // Cover scales the shorter side to fill; the longer side overflows.
    const coveredWidth = ratio >= 1 ? ratio : 1;
    const coveredHeight = ratio >= 1 ? 1 : 1 / ratio;

    return {
      x: Math.max(0, (coveredWidth * zoom - 1) * 50),
      y: Math.max(0, (coveredHeight * zoom - 1) * 50),
    };
  });

  /** True when there is somewhere to drag to; drives the cursor. */
  protected readonly canPan = computed(() => {
    const limits = this.panLimits();
    return limits.x > 0.5 || limits.y > 0.5;
  });

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
        // Stored variants are square, but read it rather than assume.
        void this.readAspect(existing);
      }
    });
  }

  /** Drops the loaded photo and every adjustment. */
  private clear(): void {
    if (this.objectUrl !== null) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.file = null;
    this.sourceUrl.set(null);
    this.showingExisting.set(false);
    this.aspect.set(1);
    this.reset();
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
    this.reset();
    void this.autoFrame(url);
  }

  /**
   * Proposes an opening crop from the image's own detail, so the editor lands
   * on the dish instead of the tablecloth. The user can still move it.
   */
  private async autoFrame(url: string): Promise<void> {
    const grid = await this.sampleLuma(url);
    if (grid === null) return;

    const { crop } = proposeFrame(grid);

    // The stage shows a centred square; convert the proposed offset into the
    // pan the viewport needs to reveal it.
    const shortest = Math.min(grid.width, grid.height);
    const travelPx = Math.max(grid.width, grid.height) - shortest;

    if (travelPx > 0) {
      const isLandscape = grid.width >= grid.height;
      const offsetPx = (isLandscape ? crop.x * grid.width : crop.y * grid.height) - travelPx / 2;
      const shiftPercent = (-offsetPx / shortest) * 100;

      if (isLandscape) this.offsetX.set(shiftPercent);
      else this.offsetY.set(shiftPercent);
    }

    this.autoFramed.set(true);
  }

  /** Reads a photo's aspect ratio without decoding it for analysis. */
  private async readAspect(url: string): Promise<void> {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = url;

    try {
      await image.decode();
    } catch {
      return;
    }
    if (image.naturalHeight > 0) {
      this.aspect.set(image.naturalWidth / image.naturalHeight);
    }
  }

  /** Decodes the picked file into a small grayscale grid for analysis. */
  private async sampleLuma(url: string): Promise<LumaGrid | null> {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = url;

    try {
      await image.decode();
    } catch {
      return null;
    }

    if (image.naturalHeight > 0) {
      this.aspect.set(image.naturalWidth / image.naturalHeight);
    }

    const scale = ANALYSIS_WIDTH / Math.max(image.naturalWidth, image.naturalHeight, 1);
    const width = Math.max(1, Math.round(image.naturalWidth * Math.min(1, scale)));
    const height = Math.max(1, Math.round(image.naturalHeight * Math.min(1, scale)));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) return null;

    context.drawImage(image, 0, 0, width, height);

    let pixels: Uint8ClampedArray;
    try {
      pixels = context.getImageData(0, 0, width, height).data;
    } catch {
      return null;
    }

    const data = new Uint8Array(width * height);
    for (let index = 0; index < width * height; index += 1) {
      const offset = index * 4;
      // Rec. 601 luma: green dominates perceived brightness.
      data[index] = Math.round(
        0.299 * (pixels[offset] ?? 0) +
          0.587 * (pixels[offset + 1] ?? 0) +
          0.114 * (pixels[offset + 2] ?? 0),
      );
    }

    return { width, height, data };
  }

  protected onPointerDown(event: PointerEvent): void {
    this.dragging = true;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    (event.target as Element).setPointerCapture?.(event.pointerId);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.dragging) return;

    const dx = event.clientX - this.lastX;
    const dy = event.clientY - this.lastY;

    const box = this.stage()?.nativeElement.getBoundingClientRect();
    if (box === undefined) return;

    // Clamped per axis so the frame never shows past the image edge.
    const limits = this.panLimits();
    this.offsetX.update((current) =>
      Math.max(-limits.x, Math.min(limits.x, current + (dx / box.width) * 100)),
    );
    this.offsetY.update((current) =>
      Math.max(-limits.y, Math.min(limits.y, current + (dy / box.height) * 100)),
    );

    this.lastX = event.clientX;
    this.lastY = event.clientY;
  }

  protected endDrag(): void {
    this.dragging = false;
  }

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    this.zoom.update((current) =>
      Math.max(1, Math.min(4, current - Math.sign(event.deltaY) * 0.08)),
    );
    this.clampOffsets();
  }

  /** Zooming out shrinks the travel: pull the frame back inside it. */
  private clampOffsets(): void {
    const limits = this.panLimits();
    this.offsetX.update((current) => Math.max(-limits.x, Math.min(limits.x, current)));
    this.offsetY.update((current) => Math.max(-limits.y, Math.min(limits.y, current)));
  }

  protected reset(): void {
    this.autoFramed.set(false);
    this.zoom.set(1);
    this.offsetX.set(0);
    this.offsetY.set(0);
  }

  /** Converts viewport state into normalised crop coordinates for the server. */
  protected emit(): void {
    if (this.file === null) return;

    const size = 1 / this.zoom();
    const centreX = 0.5 - this.offsetX() / 100;
    const centreY = 0.5 - this.offsetY() / 100;
    const clamp = (value: number): number => Math.max(0, Math.min(1 - size, value - size / 2));

    this.applied.emit({
      file: this.file,
      params: { crop: { x: clamp(centreX), y: clamp(centreY), size } },
    });
  }
}
