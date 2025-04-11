import { DestroyRef, Directive, ElementRef, computed, effect, input, signal } from '@angular/core';
import { objectFitMax } from '../misc/object-fit-max';

@Directive({
  selector: 'canvas[app-image-renderer-canvas]',
  exportAs: 'app-image-renderer-canvas',
})
export class ImageRendererCanvasComponent {
  readonly data = input.required<ImageBitmap>();
  readonly devPxSize = signal<ResizeObserverSize>({ blockSize: 0, inlineSize: 0 });
  readonly cssPxSize = signal<ResizeObserverSize>({ blockSize: 0, inlineSize: 0 });
  readonly imgTransform = computed(() => objectFitMax(this.data(), this.cssPxSize()));

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
      const devPxSize = this.devPxSize();
      const { blockSize: height, inlineSize: width } = devPxSize;
      const fitMat = objectFitMax(data, devPxSize);

      canvas.width = width;
      canvas.height = height;
      const canvasCtx = canvas.getContext('2d')!;
      canvasCtx.drawImage(data, fitMat.e, fitMat.f, fitMat.a * data.width, fitMat.d * data.height);
    });
  }
}
