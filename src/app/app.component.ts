import { Overlay, type OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltip } from '@angular/material/tooltip';
import { fileOpen } from 'browser-fs-access';
import { example_inputs } from './example-inputs.json';
import { ImageExtToMimeTypePipe } from './image-ext-to-mime-type.pipe';
import { ImageRendererCanvasComponent } from './image-renderer-canvas/image-renderer-canvas.component';
import { InfoDialogComponent } from './info-dialog/info-dialog.component';
import { PyworkService, type GlyphGeometry } from './pywork.service';
import { PRONUNCIATION_SYSTEMS } from './trunic-data';
import { TrunicGlyphDetailComponent } from './trunic-glyph-detail/trunic-glyph-detail.component';
import { TrunicGlyphComponent } from './trunic-glyph/trunic-glyph.component';

@Component({
  selector: 'app-root',
  imports: [ImageRendererCanvasComponent, TrunicGlyphComponent, MatToolbarModule, MatIconModule, MatButtonModule, MatProgressBarModule, MatFormFieldModule, MatSelectModule, MatTooltip, ImageExtToMimeTypePipe],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  host: {
    '(window:dragover)': 'windowDragOver($event)',
    '(window:drop)': 'windowDrop($event)',
    '(window:paste)': 'onPaste($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  readonly hasInputImage = signal(false);
  readonly imageRenderable = signal<ImageBitmap | undefined>(undefined);
  readonly ocrProgress = signal<undefined | number>(undefined);
  readonly recognizedGlyphs = signal<[GlyphGeometry, { strokes: number, origin: [number, number] }[]] | undefined>(undefined);
  readonly dragActive = signal(false);
  cancelCurrentOcr?: () => Promise<void> = undefined;

  readonly _PNS = PRONUNCIATION_SYSTEMS;
  readonly pronctnSystem = signal(PRONUNCIATION_SYSTEMS[0]);

  constructor(
    private readonly pywork: PyworkService,
    private readonly cdkOverlay: Overlay,
    private readonly matDialog: MatDialog,
  ) { }

  async handleData(data: DataTransfer) {
    const blob = await getImageDataBlobFromDataTransfer(data);
    if (blob === undefined) {
      throw new Error('no image data from drop or paste event');
    }
    this.startOcr(blob[0]);
  }

  async startOcr(blob_: Promise<Blob>) {
    this.hasInputImage.set(true);
    this.imageRenderable.set(undefined);
    this.ocrProgress.set(undefined);
    this.recognizedGlyphs.set(undefined);
    this.currentOverlay?.[1].dispose();

    let resolveCancel: ((v: undefined) => void) | undefined;
    const lastCancelCurrentOcr = this.cancelCurrentOcr;
    this.cancelCurrentOcr = () => new Promise(resolve => resolveCancel = resolve);

    if (lastCancelCurrentOcr) {
      await lastCancelCurrentOcr();
      if (resolveCancel) {
        resolveCancel(undefined);
        return;
      }
      this.ocrProgress.set(undefined);
      this.recognizedGlyphs.set(undefined);
    }

    const blob = await blob_;

    // race python-opencv decode and browser decode
    const browserDecodeP = createImageBitmap(blob);
    const pyDecodeP = this.pywork.decodeImage(blob);
    const bitmapDisplay = await (async () => {
      try {
        return await browserDecodeP;
      } catch (e) {
        console.warn("browser could not decode image", e);
      }
      const pyDecodeResult = await pyDecodeP;
      if (pyDecodeResult != null) {
        return await this.pywork.decoded2bitmap(pyDecodeResult);
      }
      throw new Error("could not decode image");
    })();
    this.imageRenderable.set(bitmapDisplay);

    // if we get here, at least one decode succeeded
    const pyImage = await pyDecodeP ?? await this.pywork.loadBitmap(await browserDecodeP);
    try {
      if (resolveCancel) {
        resolveCancel(undefined);
        return;
      }

      const [ocrProgress, cancel] = this.pywork.oneshotRecognize(pyImage);
      const ocrDone = Promise.withResolvers<void>();
      const ocrProgressSub = ocrProgress.subscribe({
        next: ([p, v]) => {
          this.ocrProgress.set(p * 100);
          if (v === undefined) return;
          switch (v.t) {
            case 0:
              this.recognizedGlyphs.set([v.v, []]);
              break;
            case 1:
              this.recognizedGlyphs.update(prev => prev == null ? prev : [prev[0], [...prev[1], {
                origin: v.v.origin,
                strokes: (v.v.strokes[1] << 8) | v.v.strokes[0]
              }]]);
              break;
            default:
              const _a: never = v;
          }
        },
        error: ocrDone.reject,
        complete: ocrDone.resolve,
      });

      let wasCancelled = false;
      const thisCancelCurrentOcr = async () => {
        wasCancelled = true;
        await cancel();
        try { await ocrDone.promise; } catch { }
      };
      this.cancelCurrentOcr = thisCancelCurrentOcr;

      try {
        await ocrDone.promise;
      } catch (e) {
        if (!wasCancelled) throw e;
      } finally {
        if (this.cancelCurrentOcr === thisCancelCurrentOcr) this.cancelCurrentOcr = undefined;
        ocrProgressSub.unsubscribe();
      }
    } finally {
      await this.pywork.destroy(pyImage);
    }
  }

  onImgDrop(event: DragEvent) {
    this.dragActive.set(false);
    const dt = event.dataTransfer;
    if (dt == null) return;
    event.stopPropagation();
    event.preventDefault();
    dt.dropEffect = 'copy';
    this.handleData(dt);
  }
  onImgOver(event: DragEvent) {
    const dt = event.dataTransfer;
    if (dt == null) return;
    event.stopPropagation();
    event.preventDefault();
    dt.dropEffect = 'copy';
  }

  onPaste(event: ClipboardEvent) {
    const dt = event.clipboardData
    if (dt == null) return;
    event.preventDefault();
    this.handleData(dt);
  }

  async browseImage() {
    try {
      const fh = await fileOpen({ id: 'ocr-input', mimeTypes: ['image/*'], description: 'Image files' });
      this.startOcr(Promise.resolve(fh));
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError" && e.message.includes("The user aborted a request."))) {
        throw e;
      }
    }
  }

  async useExample(example_entry: { path: string }) {
    const resp = await fetch(`example-images/${example_entry.path}.png`);
    if (!resp.ok) {
      throw Error("error response fetching example", { cause: resp });
    }
    this.startOcr(resp.blob());
  }

  windowDragOver(event: DragEvent) {
    event.dataTransfer!.dropEffect = 'none'
    event.preventDefault();
  }
  windowDrop(event: DragEvent) {
    event.preventDefault();
  }

  currentOverlay: [EventTarget, OverlayRef] | undefined = undefined;

  onGlyphToggle(event: Event, glyphIndex: number) {
    const glyphs = this.recognizedGlyphs();
    if (glyphs !== undefined && event.target != null && (event as ToggleEvent).newState === 'open') {
      this.currentOverlay?.[1].dispose();
      const overlayRef = this.cdkOverlay.create({
        positionStrategy: this.cdkOverlay.position()
          .flexibleConnectedTo(event.target as Element)
          .withPositions([
            { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top' },
            { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom' },
          ])
          .withFlexibleDimensions(false),
      });
      const compRef = overlayRef.attach(new ComponentPortal(TrunicGlyphDetailComponent));
      compRef.setInput('strokesPacked', glyphs[1][glyphIndex].strokes);
      compRef.setInput('pronctnSystem', this.pronctnSystem());
      this.currentOverlay = [event.target, overlayRef];
    } else if (this.currentOverlay && event.target === this.currentOverlay[0]) {
      this.currentOverlay[1].dispose();
    }
  }

  openInfoDialog() {
    this.matDialog.open(InfoDialogComponent, { autoFocus: 'dialog' });
  }

  _EXAMPLE_INPUTS = example_inputs;
}

async function getImageDataBlobFromDataTransfer(data: DataTransfer): Promise<[Promise<Blob>] | undefined> {
  const dtFiles = Array.from(data.items).filter(i => i.kind === 'file').map(i => i.getAsFile()!);
  const urls = data.getData('text/uri-list').split('\r\n').filter(s => !s.startsWith('#') && s.length > 0 && URL.canParse(s)).map(v => new URL(v));
  // 1. data url with type `image`
  const dataUrls = urls.filter(v => v.protocol === 'data:');
  const dataUrlResps = await Promise.all(dataUrls.map(v => fetch(v)));
  const dataUrlRespImage = dataUrlResps.find(r => r.headers.get('Content-Type')!.startsWith('image/'));
  if (dataUrlRespImage !== undefined) {
    return [dataUrlRespImage.blob()];
  }
  // 2. file with type `image` (guessed by extension)
  const imageFile = dtFiles.find(f => f.type.startsWith('image/'));
  if (imageFile !== undefined) {
    return [Promise.resolve(imageFile)];
  }
  // 3. non-data url
  const nondataUrl = urls.find(v => v.protocol !== 'data:');
  if (nondataUrl !== undefined) {
    // we could try fetching all the urls and pick the one with `Content-Type: image/*`, but that's probably too expensive
    return [(await fetch(nondataUrl)).blob()];
  }
  // 4. non-image file
  if (dtFiles.length > 0) {
    return [Promise.resolve(dtFiles[0])];
  }
  // 5. non-image data url
  if (dataUrlResps.length > 0) {
    return [dataUrlResps[0].blob()];
  }
  return undefined;
}
