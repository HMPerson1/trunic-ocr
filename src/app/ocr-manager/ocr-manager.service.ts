import { computed, Injectable, signal, type Signal, type WritableSignal } from '@angular/core';
import { pipe } from 'effect';
import * as Cause from 'effect/Cause';
import * as E from 'effect/Effect';
import * as Exit from "effect/Exit";
import * as Fiber from 'effect/Fiber';
import * as Stream from 'effect/Stream';
import { PyworkService } from './pywork.service';
import { bitmapResource } from './utils';
import type { Glyph, GlyphGeometry } from './worker-api';

@Injectable({
  providedIn: 'root'
})
export class OcrManagerService {
  constructor(private readonly pywork: PyworkService) { }

  readonly #workMutex = E.runSync(E.makeSemaphore(1));
  readonly #autoOcrState = signal<InternalOcrState | undefined>(undefined);
  readonly autoOcrState = computed(() => this.#autoOcrState()?.state);

  startOcr(blob_: Promise<Blob>, manual?: { geometry: Signal<GlyphGeometry | undefined>, glyphs: Signal<ReadonlyArray<Glyph>> }) {
    this.#stopPrevOcr();

    const internalState: InternalOcrState = (() => {
      if (manual !== undefined) {
        const state = new ManualOcrState(manual.geometry, manual.glyphs);
        const fiber = E.runFork(pipe(
          E.gen(this, function* () {
            const [pyImage, setDisplayP] = yield* this.loadImage(state.imageRenderable, blob_);
            state.ocrProgress.set(100);
            yield* Fiber.join(setDisplayP);
            yield* E.never;
          }),
          E.scoped,
          this.#workMutex.withPermits(1),
        ));
        return { state, fiber };
      } else {
        const state = new AutoOcrState();
        const fiber = E.runFork(pipe(
          this.doAutoOcr(state, blob_),
          E.scoped,
          this.#workMutex.withPermits(1),
        ));
        return { state, fiber };
      }
    })();

    this.#autoOcrState.set(internalState);

    internalState.fiber.addObserver(e => {
      if (Exit.isFailure(e) && !Exit.isInterrupted(e)) {
        // clear state on image-load failure
        const prevState = this.#autoOcrState();
        if (prevState?.fiber === internalState.fiber && prevState.state.imageRenderable() === undefined) {
          this.reset();
        }

        // make sure errors get logged
        Promise.reject(e.cause);
      }
    });
  }

  #stopPrevOcr() {
    const prevState = this.#autoOcrState();
    if (prevState !== undefined) {
      E.runFork(Fiber.interrupt(prevState.fiber));
    }
  }

  reset() {
    this.#stopPrevOcr();
    this.#autoOcrState.set(undefined);
  }

  readonly doAutoOcr = (state: AutoOcrState, blob_: Promise<Blob>) => E.gen(this, function* () {
    const [pyImage, setDisplayP] = yield* this.loadImage(state.imageRenderable, blob_);

    yield* Stream.runForEach(this.pywork.oneshotRecognize(pyImage), ([p, v]) => {
      state.ocrProgress.set(p * 100);
      if (v === undefined) return E.void;
      switch (v._tag) {
        case 'a':
          state.recognizedGeometry.set(v.v);
          break;
        case 'b':
          state.recognizedGlyphs.update(prev => [...prev, v.v]);
          break;
        default:
          const _a: never = v;
      }
      return E.void;
    });

    yield* Fiber.join(setDisplayP);
    state.done.set(true);
    yield* E.never;
  });

  readonly loadImage = (imageRenderable: WritableSignal<ImageBitmap | undefined>, blob_: Promise<Blob>) => E.gen(this, function* () {
    const blob = yield* E.promise(() => blob_);

    // race python-opencv decode and browser decode
    const browserDecodeP = yield* E.forkScoped(pipe(
      E.tryPromise(() => createImageBitmap(blob)),
      E.tapError(e => E.succeed(console.warn("browser could not decode image", e.cause))),
      bitmapResource,
    ));
    const pyDecodeP = yield* E.forkScoped(this.pywork.decodeImage(blob));

    const setDisplayP = yield* E.fork(pipe(
      Fiber.join(browserDecodeP),
      E.catchAll(e1 => pipe(
        Fiber.join(pyDecodeP),
        E.flatMap(pyDecode => this.pywork.decoded2bitmap(pyDecode)),
        E.mapErrorCause(e2 => Cause.parallel(Cause.fail(e1), e2)),
      )),
      E.map(v => imageRenderable.set(v)),
    ));

    const pyImage = yield* E.catchAll(
      Fiber.join(pyDecodeP),
      e1 => pipe(
        Fiber.join(browserDecodeP),
        E.flatMap(browserDecode => this.pywork.loadBitmap(browserDecode)),
        E.mapErrorCause(e2 => Cause.parallel(Cause.fail(e1), e2)),
      )
    );

    return [pyImage, setDisplayP] as const;
  });
}

type InternalOcrState = {
  state: OcrState;
  fiber: Fiber.RuntimeFiber<void, any>;
};

export type OcrState = {
  readonly imageRenderable: Signal<ImageBitmap | undefined>;
  readonly ocrProgress: Signal<undefined | number>;
  readonly recognizedGeometry: Signal<GlyphGeometry | undefined>;
  readonly recognizedGlyphs: Signal<ReadonlyArray<Glyph>>;
  readonly done: Signal<boolean>;
}

class BaseOcrState implements Pick<OcrState, 'imageRenderable' | 'ocrProgress' | 'done'> {
  readonly imageRenderable = signal<ImageBitmap | undefined>(undefined);
  readonly ocrProgress = signal<undefined | number>(undefined);
  readonly done = signal(false);
}

class ManualOcrState extends BaseOcrState implements OcrState {
  constructor(readonly recognizedGeometry: Signal<GlyphGeometry | undefined>, readonly recognizedGlyphs: Signal<ReadonlyArray<Glyph>>) { super(); }
}

class AutoOcrState extends BaseOcrState implements OcrState {
  readonly recognizedGeometry = signal<GlyphGeometry | undefined>(undefined);
  readonly recognizedGlyphs = signal<ReadonlyArray<Glyph>>([]);
}

export type GlyphGeometryPrim = {
  upscale: number;
  size: number;
  angle: number;
  upper: number;
  lower: number;
  stroke_width: number;
};

export function makeFullGlyphGeometry(val: GlyphGeometryPrim): GlyphGeometry {
  const a = val.angle * Math.PI / 180;
  const grid_x = val.size * Math.cos(a);
  const grid_y = val.size * Math.sin(a);
  const glyph_width = grid_x * 2;
  const glyph_height = val.lower + val.upper + val.size * 2 + grid_y * 2;
  const ox = Math.floor(val.stroke_width / 2) + val.upscale;
  const oy = val.upper + val.size + grid_y + Math.floor(val.stroke_width / 2) + val.upscale;
  const pu00x = ox;
  const pu00y = oy - val.upper - val.size;
  const pu10x = ox + grid_x;
  const pu10y = pu00y - grid_y;
  const pu01x = pu10x;
  const pu01y = pu00y + grid_y;
  const pu11x = ox + grid_x * 2;
  const pu11y = pu00y;
  const pl00x = ox;
  const pl00y = oy + val.lower + val.size;
  const pl10x = ox + grid_x;
  const pl10y = pl00y - grid_y;
  const pl01x = pl10x;
  const pl01y = pl00y + grid_y;
  const pl11x = ox + grid_x * 2;
  const pl11y = pl00y;
  return {
    upscale: val.upscale,
    stroke_width: val.stroke_width,
    glyph_width,
    glyph_template_shape: [
      Math.ceil(glyph_height) + 3 * val.stroke_width + val.upscale * 2,
      Math.ceil(glyph_width) + val.stroke_width + val.upscale * 2,
    ],
    glyph_template_origin: [ox, oy],
    all_lines: [
      [[[pu01x, pu01y], [pu11x, pu11y]]],
      [[[pu10x, pu10y], [pu10x, oy]]],
      [[[pu00x, pu00y], [pu01x, pu01y]]],
      [[[pl00x, pl00y], [pl10x, pl10y]]],
      [[[pu01x, pu01y], [pu01x, oy]], [[pl10x, pl10y], [pl01x, pl01y]]],
      [[[pl10x, pl10y], [pl11x, pl11y]]],
      [[[pu10x, pu10y], [pu11x, pu11y]]],
      [[[pu00x, pu00y], [pu10x, pu10y]]],
      [[[pu00x, pu00y], [pu00x, oy]], [[pl00x, pl00y - grid_y], [pl00x, pl00y]]],
      [[[pl00x, pl00y], [pl01x, pl01y]]],
      [[[pl01x, pl01y], [pl11x, pl11y]]],
      [],
      [[[ox, oy], [ox + glyph_width, oy]]],
    ],
    circle_center: [
      pl01x,
      pl01y + val.stroke_width,
    ],
  };
}
