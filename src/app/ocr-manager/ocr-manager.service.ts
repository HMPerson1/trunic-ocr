import { computed, Injectable, signal, type WritableSignal } from '@angular/core';
import { pipe } from 'effect';
import * as Cause from 'effect/Cause';
import * as E from 'effect/Effect';
import * as Exit from "effect/Exit";
import * as Fiber from 'effect/Fiber';
import * as Stream from 'effect/Stream';
import { PyworkService } from './pywork.service';
import { bitmapResource } from './utils';
import type { Glyph, GlyphGeometry, GlyphGeometryPrim, PyWorkImageRef } from './worker-api';

@Injectable({
  providedIn: 'root'
})
export class OcrManagerService {
  constructor(private readonly pywork: PyworkService) { }

  readonly #workMutex = E.runSync(E.makeSemaphore(1));
  readonly #autoOcrState = signal<InternalOcrState | undefined>(undefined);
  readonly autoOcrState = computed(() => this.#autoOcrState()?.state);

  startOcr(blob_: Promise<Blob>, manual: boolean) {
    this.#stopPrevOcr();

    const internalState: InternalOcrState = (() => {
      if (manual) {
        const state = new BaseOcrState();
        const fiber = E.runFork(pipe(
          E.gen(this, function* () {
            const [pyImage, setDisplayP] = yield* this.loadImage(state.imageRenderable, blob_);
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
          E.gen(this, function* () {
            const [pyImage, setDisplayP] = yield* this.loadImage(state.imageRenderable, blob_);

            yield* E.catchAllCause(
              this.doAutoOcr(pyImage, state),
              e => {
                // make sure errors get logged
                Promise.reject(e);
                return E.void;
              });

            yield* Fiber.join(setDisplayP);
            state.done.set(true);
            yield* E.never;
          }),
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
      E.flatMap(v => E.acquireRelease(E.succeed(imageRenderable.set(v)), () => E.succeed(imageRenderable.set(undefined)))),
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

  doAutoOcr(pyImage: PyWorkImageRef, state: AutoOcrState): E.Effect<void, never, never> {
    let nextGlyphId = 0;
    return Stream.runForEach(this.pywork.oneshotRecognize(pyImage), ([p, v]) => {
      state.ocrProgress.set(p * 100);
      if (v === undefined) return E.void;
      switch (v._tag) {
        case 'a':
          state.recognizedGeometry.set(v.v[1]);
          state.recognizedGeometryPrim = v.v[0];
          break;
        case 'b':
          state.recognizedGlyphs.update(prev => [...prev, { id: nextGlyphId++, ...v.v }]);
          break;
        default:
          const _a: never = v;
      }
      return E.void;
    });
  }
}

export type UiGlyph = Glyph & { readonly id: number };

type InternalOcrState = {
  state: OcrState;
  fiber: Fiber.RuntimeFiber<void, any>;
};

class BaseOcrState {
  readonly imageRenderable = signal<ImageBitmap | undefined>(undefined);
}

class AutoOcrState extends BaseOcrState {
  readonly ocrProgress = signal<undefined | number>(undefined);
  readonly done = signal(false);
  readonly recognizedGeometry = signal<GlyphGeometry | undefined>(undefined);
  /* rw */ recognizedGeometryPrim: GlyphGeometryPrim | undefined = undefined;
  readonly recognizedGlyphs = signal<ReadonlyArray<UiGlyph>>([]);
}

// ts aaaaaa :(
export type OcrState = AutoOcrState | (BaseOcrState & Partial<AutoOcrState>);

export function makeFullGlyphGeometry(val: GlyphGeometryPrim): GlyphGeometry {
  const a = val.angle * Math.PI / 180;
  const grid_x = val.size * Math.cos(a);
  const grid_y = val.size * Math.sin(a);
  const glyph_width = grid_x * 2;
  const glyph_height = val.lower + val.upper + val.size * 2 + grid_y * 2;
  const ox = Math.floor(val.stroke_width / 2) + val.upscale;
  const oy = Math.floor(val.upper + val.size + grid_y + Math.floor(val.stroke_width / 2) + val.upscale);
  const pu00x = ox + val.h_nudge;
  const pu00y = oy - val.upper - val.size;
  const pu10x = pu00x + grid_x;
  const pu10y = pu00y - grid_y;
  const pu01x = pu10x;
  const pu01y = pu00y + grid_y;
  const pu11x = pu00x + grid_x * 2;
  const pu11y = pu00y;
  const pl00x = ox + val.h_nudge;
  const pl00y = oy + val.lower + val.size;
  const pl10x = pl00x + grid_x;
  const pl10y = pl00y - grid_y;
  const pl01x = pl10x;
  const pl01y = pl00y + grid_y;
  const pl11x = pl00x + grid_x * 2;
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
