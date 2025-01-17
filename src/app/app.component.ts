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
import { pipe } from 'effect';
import * as Cause from "effect/Cause";
import * as E from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Scope from 'effect/Scope';
import { example_inputs } from './example-inputs.json';
import { ImageExtToMimeTypePipe } from './image-ext-to-mime-type.pipe';
import { ImageRendererCanvasComponent } from './image-renderer-canvas/image-renderer-canvas.component';
import { InfoDialogComponent } from './info-dialog/info-dialog.component';
import { PyworkService, type GlyphGeometry, type PyDecodedImageRef } from './pywork.service';
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
  readonly dragActive = signal(false);
  readonly pronctnSystem = signal(PRONUNCIATION_SYSTEMS[0]);
  readonly autoOcrState = signal<{ state: AutoOcrState, fiber: Fiber.RuntimeFiber<void, any>, scope: Scope.CloseableScope } | undefined>(undefined);

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

  startOcr(blob_: Promise<Blob>) {
    this.currentOverlay?.[1].dispose();

    const prevState = this.autoOcrState();
    const stopPrevFiber = E.runFork(E.uninterruptible(E.gen(function* () {
      const { fiber, scope } = yield* E.fromNullable(prevState);
      const exit = yield* Fiber.interrupt(fiber);
      yield* Scope.close(scope, exit);
    })));

    const state = new AutoOcrState();
    const scope = E.runSync(Scope.make());
    const fiber = E.runFork(E.gen(this, function* () {
      yield* E.uninterruptible(stopPrevFiber.await);
      yield* Scope.extend(doAutoOcr(this.pywork, state, blob_), scope);
    }));
    this.autoOcrState.set({ state, fiber, scope });

    fiber.addObserver(e => {
      if (Exit.isFailure(e) && !Exit.isInterrupted(e)) {
        // clear state on image-load failure
        const prevState = this.autoOcrState();
        if (prevState?.fiber === fiber && prevState.state.imageRenderable() === undefined) {
          this.autoOcrState.set(undefined);
          E.runFork(Scope.close(scope, Exit.void));
        }

        // make sure errors get logged
        Promise.reject(e.cause);
      }
    });
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

  onGlyphToggle(event: Event, glyphStrokes: number) {
    if (event.target != null && (event as ToggleEvent).newState === 'open') {
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
      compRef.setInput('strokesPacked', glyphStrokes);
      compRef.setInput('pronctnSystem', this.pronctnSystem());
      this.currentOverlay = [event.target, overlayRef];
    } else if (this.currentOverlay && event.target === this.currentOverlay[0]) {
      this.currentOverlay[1].dispose();
    }
  }

  openInfoDialog() {
    this.matDialog.open(InfoDialogComponent, { autoFocus: 'dialog' });
  }

  readonly _PNS = PRONUNCIATION_SYSTEMS;
  readonly _EXAMPLE_INPUTS = example_inputs;
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

type Glyph = { strokes: number, origin: [number, number] };
class AutoOcrState {
  readonly imageRenderable = signal<ImageBitmap | undefined>(undefined);
  readonly ocrProgress = signal<undefined | number>(undefined);
  readonly recognizedGeometry = signal<GlyphGeometry | undefined>(undefined);
  readonly recognizedGlyphs = signal<ReadonlyArray<Glyph>>([]);
}

const doAutoOcr = (pywork: PyworkService, state: AutoOcrState, blob_: Promise<Blob>) => E.gen(function* () {
  const pyworkResource = E.acquireRelease((r: PyDecodedImageRef) => E.promise(() => pywork.destroy(r)));

  const blob = yield* E.promise(() => blob_);

  // race python-opencv decode and browser decode
  const browserDecodeP = yield* E.fork(bitmapResource(
    E.tapError(
      E.tryPromise(() => createImageBitmap(blob)),
      e => E.succeed(console.warn("browser could not decode image", e.cause)))
  ));
  const pyDecodeP = yield* E.fork(pyworkResource(E.tryPromise(() => pywork.decodeImage(blob))));

  const setDisplayP = yield* E.fork(pipe(
    Fiber.join(browserDecodeP),
    E.catchAll(e1 => pipe(
      Fiber.join(pyDecodeP),
      E.flatMap(pyDecode => bitmapResource(E.promise(() => pywork.decoded2bitmap(pyDecode)))),
      E.mapErrorCause(e2 => Cause.parallel(Cause.fail(e1), e2)),
    )),
    E.map(v => state.imageRenderable.set(v)),
  ));

  const pyImage = yield* E.catchAll(
    Fiber.join(pyDecodeP),
    e1 => pipe(
      Fiber.join(browserDecodeP),
      E.flatMap(browserDecode => pyworkResource(E.promise(() => pywork.loadBitmap(browserDecode)))),
      E.mapErrorCause(e2 => Cause.parallel(Cause.fail(e1), e2)),
    ),
  );

  yield* E.tryPromise(abortSig =>
    pywork.oneshotRecognize(pyImage, abortSig).forEach(([p, v]) => {
      state.ocrProgress.set(p * 100);
      if (v === undefined) return;
      switch (v.t) {
        case 0:
          state.recognizedGeometry.set(v.v);
          break;
        case 1:
          state.recognizedGlyphs.update(prev => [...prev, {
            origin: v.v.origin,
            strokes: (v.v.strokes[1] << 8) | v.v.strokes[0]
          }]);
          break;
        default:
          const _a: never = v;
      }
    })
  );

  yield* setDisplayP.await;
});

const bitmapResource = E.acquireRelease((b: ImageBitmap) => E.succeed(b.close()));
