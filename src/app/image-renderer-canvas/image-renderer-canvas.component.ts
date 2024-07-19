import { DestroyRef, Directive, ElementRef, effect, input, signal } from '@angular/core';

@Directive({
  selector: 'canvas[app-image-renderer-canvas]',
  standalone: true
})
export class ImageRendererCanvasComponent {
  readonly data = input<ImageBitmap | undefined>();
  readonly devPxSize = signal<ResizeObserverSize>({ blockSize: 0, inlineSize: 0 });

  constructor(hostElem: ElementRef<HTMLCanvasElement>, destroyRef: DestroyRef) {
    const canvas = hostElem.nativeElement;
    const ro = new ResizeObserver(entries => this.devPxSize.set(entries[0].devicePixelContentBoxSize[0]))
    ro.observe(canvas);
    destroyRef.onDestroy(() => ro.disconnect());

    effect(() => {
      const { blockSize: height, inlineSize: width } = this.devPxSize();
      const data = this.data();
      if (data === undefined) return;
      const widthScale = width / data.width;
      const heightScale = height / data.height;
      const scale = Math.min(widthScale, heightScale);
      const drawnWidth = data.width * scale;
      const drawnHeight = data.height * scale;

      canvas.width = width;
      canvas.height = height;
      const canvasCtx = canvas.getContext('2d')!;
      canvasCtx.drawImage(data, (width - drawnWidth) / 2, (height - drawnHeight) / 2, drawnWidth, drawnHeight);
    });
  }
}
