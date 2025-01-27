import { Injectable, type OnDestroy } from '@angular/core';
import * as BrowserWorker from "@effect/platform-browser/BrowserWorker";
import * as EffectWorker from "@effect/platform/Worker";
import { pipe } from 'effect';
import * as E from "effect/Effect";
import * as Exit from 'effect/Exit';
import * as Fiber from 'effect/Fiber';
import type * as Schema from 'effect/Schema';
import * as Scope from 'effect/Scope';
import * as Stream from 'effect/Stream';
import { PyworkEarlyService } from './pywork-early.service';
import { bitmapResource } from './utils';
import { Decoded2Bitmap, DecodeImage, Destroy, LoadBitmap, OneshotRecognize, WorkerMessage, type OneshotRecognizeProgress, type PyWorkImageRef, type PyWorkRef } from "./worker-api.js";

@Injectable({
  providedIn: 'root'
})
export class PyworkService implements OnDestroy {
  readonly #scope: Scope.CloseableScope;
  readonly #worker: E.Effect<EffectWorker.SerializedWorker<WorkerMessage>>

  constructor(early: PyworkEarlyService) {
    this.#scope = E.runSync(Scope.make());
    this.#worker = pipe(
      EffectWorker.makeSerialized<WorkerMessage>({}),
      Scope.extend(this.#scope),
      E.provide(BrowserWorker.layer(() => early.worker)),
      E.runFork,
      Fiber.join,
      E.orDie
    );
  }

  ngOnDestroy() {
    E.runFork(Scope.close(this.#scope, Exit.void))
  }

  #requestStream<Req extends WorkerMessage>(req: Req):
    Req extends Schema.WithResult<infer A, infer _I, infer E, infer _EI, infer R> ? Stream.Stream<A, E, R> : never {
    return Stream.flatMap(this.#worker, worker => Stream.catchTags(worker.execute(req) as any, {
      ParseError: (e: unknown) => Stream.die(e),
      WorkerError: (e: unknown) => Stream.die(e),
    })) as any;
  }

  #request<Req extends WorkerMessage>(req: Req):
    Req extends Schema.WithResult<infer A, infer _I, infer E, infer _EI, infer R> ? E.Effect<A, E, R> : never {
    return E.flatMap(this.#worker, worker => E.catchTags(worker.executeEffect(req) as any, {
      ParseError: e => E.die(e),
      WorkerError: e => E.die(e),
    })) as any;
  }

  #acqRelPyWorkRef: <T extends PyWorkRef, E, R>(acq: E.Effect<T, E, R>) => E.Effect<T, E, Scope.Scope | R>
    = E.acquireRelease(ref => E.orDie(E.flatMap(this.#worker, w => w.executeEffect(new Destroy({ ref })))))

  decodeImage(blob: Blob): E.Effect<PyWorkImageRef, undefined, Scope.Scope> {
    return this.#acqRelPyWorkRef(this.#request(new DecodeImage({ blob })));
  }

  decoded2bitmap(imgRef: PyWorkImageRef): E.Effect<ImageBitmap, never, Scope.Scope> {
    return bitmapResource(this.#request(new Decoded2Bitmap({ imgRef })));
  }

  loadBitmap(imgBmp: ImageBitmap): E.Effect<PyWorkImageRef, never, Scope.Scope> {
    return this.#acqRelPyWorkRef(this.#request(new LoadBitmap({ imgBmp })));
  }

  oneshotRecognize(imgRef: PyWorkImageRef): Stream.Stream<OneshotRecognizeProgress, never, never> {
    return this.#requestStream(new OneshotRecognize({ imgRef }));
  }
}
