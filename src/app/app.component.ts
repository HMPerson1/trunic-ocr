import { ChangeDetectionStrategy, Component, Injector, afterNextRender, computed, signal } from '@angular/core';
import { EventPhase } from '@angular/core/primitives/event-dispatch';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatToolbar } from '@angular/material/toolbar';
import { MatTooltip } from '@angular/material/tooltip';
import { fileOpen } from 'browser-fs-access';
import { example_inputs } from './example-inputs.json';
import { ImageRendererCanvasComponent } from './image-renderer-canvas/image-renderer-canvas.component';
import { InfoDialogOpenButtonDirective } from './info-dialog/info-dialog-open-button.directive';
import { ImageExtToMimeTypePipe } from './misc/image-ext-to-mime-type.pipe';
import type { AutoOcrState, OcrManagerService } from './ocr-manager/ocr-manager.service';
import { PyworkEarlyService } from './ocr-manager/pywork-early.service';
import { OcrOverlayComponent } from "./ocr-overlay/ocr-overlay.component";
import { PRONUNCIATION_SYSTEMS } from './trunic-data';

@Component({
  selector: 'app-root',
  imports: [ImageRendererCanvasComponent, MatToolbar, MatIcon, MatButton, MatIconButton, MatProgressBar, MatFormField, MatLabel, MatSelect, MatOption, MatTooltip, ImageExtToMimeTypePipe, OcrOverlayComponent, InfoDialogOpenButtonDirective],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  host: {
    '(window:paste)': 'onPaste($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  readonly dragActive = signal(false);
  readonly pronctnSystem = signal(PRONUNCIATION_SYSTEMS[0]);
  readonly autoOcrState = computed<AutoOcrState | undefined>(() => this.#ocrManager()?.autoOcrState());
  readonly hydrationDone = signal(false);

  readonly #ocrManager = signal<OcrManagerService | undefined>(undefined);
  readonly #ocrManagerP: Promise<OcrManagerService>;

  constructor(
    injector: Injector,
    // worker service is injected statically so it starts initializing immediately
    _pywork: PyworkEarlyService,
  ) {
    this.#ocrManagerP = (typeof Worker !== 'undefined') ? (async () => {
      const m = await import('./ocr-manager/ocr-manager.service');
      const svc = injector.get(m.OcrManagerService);
      this.#ocrManager.set(svc);
      return svc;
    })() : new Promise(() => { });

    afterNextRender({
      earlyRead: () => {
        this.hydrationDone.set(true)
        performance.mark('app component hydration done')
      },
    })
  }

  async handleData(data: DataTransfer) {
    const blob = await getImageDataBlobFromDataTransfer(data);
    if (blob === undefined) {
      throw new Error('no image data from drop or paste event');
    }
    this.startOcr(blob[0]);
  }

  async startOcr(blob: Promise<Blob>) {
    (await this.#ocrManagerP).startOcr(blob);
  }

  async resetOcr() {
    (await this.#ocrManagerP).reset();
  }

  onImgDrop(event: DragEvent) {
    if (event.eventPhase === EventPhase.REPLAY) return;
    this.dragActive.set(false);
    const dt = event.dataTransfer;
    if (dt == null) return;
    event.stopPropagation();
    event.preventDefault();
    dt.dropEffect = 'copy';
    this.handleData(dt);
  }
  onImgOver(event: DragEvent) {
    if (event.eventPhase === EventPhase.REPLAY) return;
    const dt = event.dataTransfer;
    if (dt == null) return;
    event.stopPropagation();
    event.preventDefault();
    dt.dropEffect = 'copy';
  }

  onPaste(event: ClipboardEvent) {
    if (event.eventPhase === EventPhase.REPLAY) return;
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

  useExample(example_entry: { path: string }) {
    this.startOcr((async () => {
      const resp = await fetch(`example-images/${example_entry.path}.png`);
      if (!resp.ok) {
        throw Error("error response fetching example", { cause: resp });
      }
      return resp.blob();
    })());
  }

  readonly _PNS = PRONUNCIATION_SYSTEMS;
  readonly _EXAMPLE_INPUTS = example_inputs;
  readonly _EventPhase_REPLAY = EventPhase.REPLAY;
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
