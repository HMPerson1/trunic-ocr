import { computed, DestroyRef, Directive, effect, ElementRef, input, signal } from '@angular/core';
import { objectFitMax } from '../misc/object-fit-max';

@Directive({
  selector: 'canvas[app-cropped-image-renderer-canvas]',
  exportAs: 'app-cropped-image-renderer-canvas'
})
export class CroppedImageRendererCanvasComponent {
  readonly inputImage = input<ImageBitmap>();
  readonly windowSize = input.required<{ width: number, height: number }>();
  readonly windowPos = input.required<readonly [number, number]>();
  readonly devPxSize = signal<ResizeObserverSize>({ blockSize: 0, inlineSize: 0 });
  readonly cssPxSize = signal<ResizeObserverSize>({ blockSize: 0, inlineSize: 0 });
  readonly imgTransform = computed(() => objectFitMax(this.windowSize(), this.cssPxSize()));

  constructor(hostElem: ElementRef<HTMLCanvasElement>, destroyRef: DestroyRef) {
    const canvas = hostElem.nativeElement;
    const ro = new ResizeObserver(entries => {
      this.devPxSize.set(entries[0].devicePixelContentBoxSize[0]);
      this.cssPxSize.set(entries[0].contentBoxSize[0]);
    });
    ro.observe(canvas);
    destroyRef.onDestroy(() => ro.disconnect());

    effect(() => {
      const data = this.inputImage();
      if (!data) return;
      const devPxSize = this.devPxSize();
      const { blockSize: height, inlineSize: width } = devPxSize;
      const fitMat = objectFitMax(this.windowSize(), devPxSize);
      const windowPos = this.windowPos();

      canvas.width = width;
      canvas.height = height;
      const canvasCtx = canvas.getContext('2d')!;
      canvasCtx.drawImage(data, fitMat.e - windowPos[0] * fitMat.a, fitMat.f - windowPos[1] * fitMat.d, fitMat.a * data.width, fitMat.d * data.height);
    });
  }
}
