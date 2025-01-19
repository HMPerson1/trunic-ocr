import { computed, Injectable, signal } from '@angular/core';
import { pipe } from 'effect';
import * as Cause from 'effect/Cause';
import * as E from 'effect/Effect';
import * as Exit from "effect/Exit";
import * as Fiber from 'effect/Fiber';
import * as Scope from 'effect/Scope';
import { type GlyphGeometry, type PyDecodedImageRef, PyworkService } from './pywork.service';

@Injectable({
  providedIn: 'root'
})
export class OcrManagerService {
  constructor(private readonly pywork: PyworkService) { }

  readonly #autoOcrState = signal<{ state: AutoOcrState, fiber: Fiber.RuntimeFiber<void, any>, scope: Scope.CloseableScope } | undefined>(undefined);
  readonly autoOcrState = computed(() => this.#autoOcrState()?.state);

  startOcr(blob_: Promise<Blob>) {
    const prevState = this.#autoOcrState();
    const stopPrevFiber = E.runFork(E.uninterruptible(E.gen(function* () {
      const { fiber, scope } = yield* E.fromNullable(prevState);
      const exit = yield* Fiber.interrupt(fiber);
      yield* Scope.close(scope, exit);
    })));

    const state = new AutoOcrState();
    const scope = E.runSync(Scope.make());
    const fiber = E.runFork(E.gen(this, function* () {
      yield* E.uninterruptible(stopPrevFiber.await);
      yield* Scope.extend(this.doAutoOcr(state, blob_), scope);
    }));
    this.#autoOcrState.set({ state, fiber, scope });

    fiber.addObserver(e => {
      if (Exit.isFailure(e) && !Exit.isInterrupted(e)) {
        // clear state on image-load failure
        const prevState = this.#autoOcrState();
        if (prevState?.fiber === fiber && prevState.state.imageRenderable() === undefined) {
          this.#autoOcrState.set(undefined);
          E.runFork(Scope.close(scope, Exit.void));
        }

        // make sure errors get logged
        Promise.reject(e.cause);
      }
    });
  }

  readonly doAutoOcr = (state: AutoOcrState, blob_: Promise<Blob>) => E.gen(this, function* () {
    const blob = yield* E.promise(() => blob_);

    // race python-opencv decode and browser decode
    const browserDecodeP = yield* E.fork(bitmapResource(
      E.tapError(
        E.tryPromise(() => createImageBitmap(blob)),
        e => E.succeed(console.warn("browser could not decode image", e.cause)))
    ));
    const pyDecodeP = yield* E.fork(this.pyworkResource(E.tryPromise(() => this.pywork.decodeImage(blob))));

    const setDisplayP = yield* E.fork(pipe(
      Fiber.join(browserDecodeP),
      E.catchAll(e1 => pipe(
        Fiber.join(pyDecodeP),
        E.flatMap(pyDecode => bitmapResource(E.promise(() => this.pywork.decoded2bitmap(pyDecode)))),
        E.mapErrorCause(e2 => Cause.parallel(Cause.fail(e1), e2))
      )),
      E.map(v => state.imageRenderable.set(v))
    ));

    const pyImage = yield* E.catchAll(
      Fiber.join(pyDecodeP),
      e1 => pipe(
        Fiber.join(browserDecodeP),
        E.flatMap(browserDecode => this.pyworkResource(E.promise(() => this.pywork.loadBitmap(browserDecode)))),
        E.mapErrorCause(e2 => Cause.parallel(Cause.fail(e1), e2))
      )
    );

    yield* E.tryPromise(abortSig =>
      this.pywork.oneshotRecognize(pyImage, abortSig).forEach(([p, v]) => {
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

  readonly pyworkResource = E.acquireRelease((r: PyDecodedImageRef) => E.promise(() => this.pywork.destroy(r)));
}

export type Glyph = { strokes: number; origin: [number, number]; };
export class AutoOcrState {
  readonly imageRenderable = signal<ImageBitmap | undefined>(undefined);
  readonly ocrProgress = signal<undefined | number>(undefined);
  readonly recognizedGeometry = signal<GlyphGeometry | undefined>(undefined);
  readonly recognizedGlyphs = signal<ReadonlyArray<Glyph>>([]);
}

const bitmapResource = E.acquireRelease((b: ImageBitmap) => E.succeed(b.close()));

