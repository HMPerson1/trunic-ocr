import { DestroyRef, Directive, ElementRef, computed, effect, input, signal } from '@angular/core';

@Directive({
  selector: 'canvas[app-image-renderer-canvas]',
  exportAs: 'app-image-renderer-canvas',
})
export class ImageRendererCanvasComponent {
  readonly data = input.required<ImageBitmap>();
  readonly devPxSize = signal<ResizeObserverSize>({ blockSize: 0, inlineSize: 0 });
  readonly cssPxSize = signal<ResizeObserverSize>({ blockSize: 0, inlineSize: 0 });
  readonly imgTransform = computed(() => {
    const data = this.data();
    const { blockSize: height, inlineSize: width } = this.cssPxSize();
    const widthScale = width / data.width;
    const heightScale = height / data.height;
    const scale = Math.min(widthScale, heightScale);
    const drawnWidth = data.width * scale;
    const drawnHeight = data.height * scale;
    return new DOMMatrixReadOnly([scale, 0, 0, scale, (width - drawnWidth) / 2, (height - drawnHeight) / 2]);
  });

  constructor(hostElem: ElementRef<HTMLCanvasElement>, destroyRef: DestroyRef) {
    const canvas = hostElem.nativeElement;
    const ro = new ResizeObserver(entries => {
      this.devPxSize.set(entries[0].devicePixelContentBoxSize[0]);
      this.cssPxSize.set(entries[0].contentBoxSize[0]);
    });
    ro.observe(canvas);
    destroyRef.onDestroy(() => ro.disconnect());

    effect(() => {
      const data = this.data();
      const { blockSize: height, inlineSize: width } = this.devPxSize();
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
