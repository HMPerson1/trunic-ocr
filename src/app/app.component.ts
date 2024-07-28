import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ImageRendererCanvasComponent } from './image-renderer-canvas/image-renderer-canvas.component';
import { PyworkService, type GlyphGeometry } from './pywork.service';
import { TrunicGlyphComponent } from './trunic-glyph/trunic-glyph.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ImageRendererCanvasComponent, TrunicGlyphComponent, MatToolbarModule, MatIconModule, MatButtonModule, MatProgressBarModule],
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
  readonly recognizedGlyphs = signal<[GlyphGeometry, { strokes: number, origin: DOMPointReadOnly }[]] | undefined>(undefined);
  readonly dragActive = signal(false);

  constructor(private readonly pywork: PyworkService) {
  }

  async handleData(data: DataTransfer) {
    const blob = await getImageDataBlobFromDataTransfer(data);
    if (blob === undefined) {
      throw new Error('no image data from drop or paste event');
    }
    this.hasInputImage.set(true);
    this.imageRenderable.set(undefined);
    this.recognizedGlyphs.set(undefined);

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
      const [glyphGeometry, strokesPackedFlat, originsFlat] = await this.pywork.oneshotRecognize(pyImage);
      this.recognizedGlyphs.set([glyphGeometry,
        Array.from({ length: originsFlat.length / 2 }, (_v, i) => ({
          origin: new DOMPointReadOnly(originsFlat[i * 2], originsFlat[i * 2 + 1]),
          strokes: (strokesPackedFlat[i * 2 + 1] << 6) | strokesPackedFlat[i * 2]
        }))
      ]);
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

  windowDragOver(event: DragEvent) {
    event.dataTransfer!.dropEffect = 'none'
    event.preventDefault();
  }
  windowDrop(event: DragEvent) {
    event.preventDefault();
  }
}

async function getImageDataBlobFromDataTransfer(data: DataTransfer): Promise<Blob | undefined> {
  const dtFiles = Array.from(data.items).filter(i => i.kind === 'file').map(i => i.getAsFile()!);
  const urls = data.getData('text/uri-list').split('\r\n').filter(s => !s.startsWith('#') && s.length > 0 && URL.canParse(s)).map(v => new URL(v));
  // 1. data url with type `image`
  const dataUrls = urls.filter(v => v.protocol === 'data:');
  const dataUrlResps = await Promise.all(dataUrls.map(v => fetch(v)));
  const dataUrlRespImage = dataUrlResps.find(r => r.headers.get('Content-Type')!.startsWith('image/'));
  if (dataUrlRespImage !== undefined) {
    return await dataUrlRespImage.blob();
  }
  // 2. file with type `image` (guessed by extension)
  const imageFile = dtFiles.find(f => f.type.startsWith('image/'));
  if (imageFile !== undefined) {
    return imageFile;
  }
  // 3. non-data url
  const nondataUrl = urls.find(v => v.protocol !== 'data:');
  if (nondataUrl !== undefined) {
    // we could try fetching all the urls and pick the one with `Content-Type: image/*`, but that's probably too expensive
    return await (await fetch(nondataUrl)).blob();
  }
  // 4. non-image file
  if (dtFiles.length > 0) {
    return dtFiles[0];
  }
  // 5. non-image data url
  if (dataUrlResps.length > 0) {
    return await dataUrlResps[0].blob();
  }
  return undefined;
}
