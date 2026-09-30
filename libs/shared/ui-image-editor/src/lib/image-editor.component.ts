import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
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
 * Elegir la foto del plato. Nada más.
 *
 * Tuvo seis controles —nitidez, radio, desenfoque, brillo, saturación y un
 * punto de foco—, después quedó en recortar y mover, y ahora en elegir el
 * archivo. Lo que sacó el recorte fue que la foto ya entraba cortada al
 * editor: el cuadrado se comía los costados de una apaisada, y arrastrarla
 * sólo elegía qué mitad del plato se perdía. La foto entra entera y el
 * servidor rellena lo que le falta para ser cuadrada.
 *
 * Lo único que se le hace a la foto antes de mandarla es bajarla a la medida
 * con la que el servidor la iba a guardar igual. No se recorta ni se retoca.
 */
@Component({
  selector: 'itd-image-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './image-editor.component.css',
  template: `
    <div class="editor">
      @if (sourceUrl(); as url) {
        <div class="stage">
          <img class="layer" [src]="url" alt="" />
        </div>

        <!-- Dice qué se está viendo y, de paso, por qué "Aplicar" está
             apagado: esta foto ya está en la carta, y lo único que queda por
             hacer con ella es reemplazarla. -->
        @if (showingExisting()) {
          <p class="existing-note" role="status">
            Ésta es la foto guardada · subí otra para reemplazarla
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

  readonly applied = output<{ file: File }>();

  protected readonly sourceUrl = signal<string | null>(null);
  /** Mientras se achica la foto: son unos segundos en un teléfono viejo. */
  protected readonly preparando = signal(false);
  /** True while showing the stored photo: there is nothing to apply. */
  protected readonly showingExisting = signal(false);

  private file: File | null = null;
  private objectUrl: string | null = null;

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
  }

  protected async emit(): Promise<void> {
    const file = this.file;
    if (file === null) return;

    this.preparando.set(true);
    try {
      this.applied.emit({ file: await achicarParaSubir(file) });
    } finally {
      this.preparando.set(false);
    }
  }
}
