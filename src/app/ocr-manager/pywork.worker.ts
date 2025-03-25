/// <reference lib="webworker" />

import * as BrowserRunner from "@effect/platform-browser/BrowserWorkerRunner";
import * as Runner from "@effect/platform/WorkerRunner";
import { pipe } from "effect";
import * as Channel from "effect/Channel";
import * as Chunk from "effect/Chunk";
import * as Context from "effect/Context";
import * as E from 'effect/Effect';
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";
import * as Stream from 'effect/Stream';
import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.mjs";
import type { PyodideInterface } from "pyodide";
import type { PyBuffer, PyBufferView, PyGenerator, PyProxy } from "pyodide/ffi";
import { iotaChannel } from "./utils";
import { WorkerMessage, type OneshotRecognizeProgress, type OneshotRecognizeProgressData, type PyWorkImageRef, type PyWorkRef } from "./worker-api";

const workerInitStartMark = performance.mark('worker init start');

const WorkerLive = Runner.layerSerialized(WorkerMessage, {
  decodeImage: ({ blob }) => E.gen(function* () {
    const { py, ocrCore } = yield* OcrCorePyodide;
    const imageBuf = yield* E.promise(() => blob.arrayBuffer());
    const pynparr1: PyBuffer | undefined = ocrCore.decodeImage(py.toPy(imageBuf));
    if (pynparr1 != null) {
      return (yield* ProxyStore).add(pynparr1) as PyWorkImageRef;
    } else {
      console.warn("opencv could not decode image");
      return yield* E.fail(undefined);
    }
  }),
  decoded2bitmap: ({ imgRef }) => E.scoped(E.gen(function* () {
    const { ocrCore } = yield* OcrCorePyodide;
    const pynparr2: PyBuffer = yield* acqRelPyProxy(E.succeed(ocrCore.image2Rgba((yield* ProxyStore).get(imgRef))));
    const bufview = yield* acqRelPyBufferView(E.succeed(pynparr2.getBuffer()));
    const [h, w, d] = bufview.shape;
    if (!(bufview.shape.length === 3 && d === 4 && bufview.data instanceof Uint8Array && bufview.c_contiguous)) throw new Error("bad py buffer");
    return yield* E.promise(() => createImageBitmap(new ImageData(new Uint8ClampedArray(bufview.data.buffer, bufview.data.byteOffset, bufview.data.length), w)));
  })),
  loadBitmap: ({ imgBmp }) => E.scoped(E.gen(function* () {
    const { py, ocrCore } = yield* OcrCorePyodide;
    const canvas = new OffscreenCanvas(imgBmp.width, imgBmp.height);
    const canvasCtx = canvas.getContext('2d', { willReadFrequently: true })!;
    canvasCtx.drawImage(imgBmp, 0, 0);
    const bmpData = canvasCtx.getImageData(0, 0, imgBmp.width, imgBmp.height);
    const pynparr1: PyBuffer = yield* acqRelPyProxy(E.succeed(ocrCore.loadBitmap(py.toPy(bmpData.data), bmpData.width, bmpData.height)));
    return (yield* ProxyStore).add(pynparr1) as PyWorkImageRef;
  })),
  oneshotRecognize: ({ imgRef }) => doOneshotRecognizeOnce(imgRef, false),
  destroy: ({ ref }) => E.gen(function* () {
    const proxyStore = yield* ProxyStore;
    const pyobj: PyProxy = proxyStore.get(ref);
    proxyStore.del(ref);
    pyobj.destroy();
  }),
});

const doOneshotRecognizeOnce = (imgRef: PyWorkImageRef, lax: boolean): Stream.Stream<OneshotRecognizeProgress, never, OcrCorePyodide | ProxyStore> =>
  Stream.fromChannel(pipe(
    Channel.write(mkOsRecPrg(0, undefined)),
    Channel.zipRight(Channel.flatMap(OcrCorePyodide, ({ ocrCore }) => Channel.flatMap(ProxyStore, proxyStore => Channel.unwrapScopedWith(scope => pipe(
      doFindGlyphsImpl(proxyStore.get(imgRef), lax, ocrCore),
      Channel.provideService(Scope.Scope, scope),
      Channel.mapOut(p => mkOsRecPrg(p / 2, undefined)),
      Channel.flatMap(([strokesPx, geomPrim, geomPx, tmplPx, originsPx]) => {
        const geomPodPx = geomPx.to_pod();
        const geomData = geomPodPx.toJs({ create_pyproxies: false, dict_converter: Object.fromEntries });
        geomPodPx.destroy();
        const glyphsCount = originsPx.length;
        return Channel.zipRight(
          Channel.write(mkOsRecPrg(0.5, { _tag: 'a', v: [geomPrim, geomData] })),
          pipe(
            acqRelPyGenerator(E.succeed(ocrCore.fitGlyphs(strokesPx, geomPx, tmplPx, originsPx))),
            E.map(pyGen => pipe(
              Channel.mapOut(iotaChannel(0, glyphsCount), i => {
                const iterRes: IteratorResult<PyProxy> = pyGen.next();
                if (iterRes.done) throw new Error("bad py yield");
                const glyph = iterRes.value.toJs({ create_pyproxies: false, dict_converter: Object.fromEntries });
                iterRes.value.destroy();
                return mkOsRecPrg(0.5 + (i + 1) / (2 * glyphsCount), { _tag: 'b', v: { origin: glyph.origin, strokes: (glyph.strokes[1] << 8) | glyph.strokes[0] } });
              }),
              Channel.flatMap(() => {
                const iterRet = pyGen.next();
                if (!(iterRet.done && iterRet.value === undefined)) return Channel.sync(() => { throw new Error("bad py yield"); });
                return Channel.void;
              }),
            )),
            Channel.unwrapScoped,
          ),
        );
      }),
      E.succeed,
    ))))),
    Channel.concatMap(([p, v]) => {
      performance.mark('osRec prog', { detail: p });
      const ret = Channel.write(Chunk.of([p, v] as const));
      return (p === 0 || p === 1) ? ret : Channel.zipRight(ret, E.sleep(0));
    }),
  ));

const mkOsRecPrg = (p: number, v: OneshotRecognizeProgressData): OneshotRecognizeProgress => [p, v];

const doFindGlyphsImpl = (pyimage: PyProxy, lax: boolean, ocrCore: any): Channel.Channel<number, unknown, never, unknown, readonly [any, any, any, any, any], unknown, Scope.Scope> =>
  pipe(
    acqRelPyGenerator(E.succeed(ocrCore.findGlyphs.callKwargs(pyimage, lax ? { lax: true } : {}))),
    E.map(pyGen => pipe(
      Channel.mapOut(iotaChannel(1, 13), i => {
        const iterRes = pyGen.next();
        if (!(!iterRes.done && iterRes.value === i)) throw new Error("bad py yield");
        return i / 13;
      }),
      Channel.zipRight(E.uninterruptible(E.gen(function* () {
        const iterRet: IteratorResult<any, PyProxy> = pyGen.next();
        if (!iterRet.done) throw new Error("bad py yield");
        const [strokesPx_, geomPrimPx_, geomPx_, tmplPx_, originsPx_] = iterRet.value.toJs({ depth: 1 });
        iterRet.value.destroy();

        const strokesPx = yield* acqRelPyProxy(E.succeed(strokesPx_));
        const geomPx = yield* acqRelPyProxy(E.succeed(geomPx_));
        const tmplPx = yield* acqRelPyProxy(E.succeed(tmplPx_));
        const originsPx = yield* acqRelPyProxy(E.succeed(originsPx_));

        const geomPrim = geomPrimPx_.toJs({ create_pyproxies: false, dict_converter: Object.fromEntries });
        geomPrimPx_.destroy();
        return [strokesPx, geomPrim, geomPx, tmplPx, originsPx] as const;
      }))),
    )),
    Channel.unwrapScoped,
  );

type OcrCorePyodideI = {
  py: PyodideInterface;
  ocrCore: any;
};
class OcrCorePyodide extends Context.Tag('OcrCorePyodide')<OcrCorePyodide, OcrCorePyodideI>() { }

const makeOcrCorePyodide: E.Effect<OcrCorePyodideI> = E.promise(async () => {
  if (!isLittleEndian()) {
    throw new Error('not_little_endian');
  }
  const ocrCoreWheelP = (async () => {
    const resp = await fetch("trunic_ocr_core-0.1.0-py3-none-any.whl");
    if (!resp.ok) throw new Error("error fetching ocr wheel", { cause: resp });
    return resp.arrayBuffer();
  })();
  const pyodide = await loadPyodide({ packages: ['numpy', 'opencv-python'] });
  pyodide.unpackArchive(await ocrCoreWheelP, 'wheel');
  const pypkg = pyodide.pyimport('trunic_ocr_core');
  performance.measure('worker init', workerInitStartMark.name);
  return {
    py: pyodide,
    ocrCore: pypkg,
  };
});

const acqRelPyGenerator: <T extends PyGenerator, E, R>(acquire: E.Effect<T, E, R>) => E.Effect<T, E, Scope.Scope | R>
  = E.acquireRelease(p => { p.return(undefined); p.destroy(); return E.void; });
const acqRelPyProxy: <T extends PyProxy, E, R>(acquire: E.Effect<T, E, R>) => E.Effect<T, E, Scope.Scope | R>
  = E.acquireRelease(p => { p.destroy(); return E.void; });
const acqRelPyBufferView: <T extends PyBufferView, E, R>(acquire: E.Effect<T, E, R>) => E.Effect<T, E, Scope.Scope | R>
  = E.acquireRelease(p => { p.release(); return E.void; });

type ProxyStoreI = {
  add(obj: any): PyWorkRef;
  get(idx: PyWorkRef): any;
  del(idx: PyWorkRef): void;
};
class ProxyStore extends Context.Tag('ProxyStore')<ProxyStore, ProxyStoreI>() { }

class ProxyStoreImpl implements ProxyStoreI {
  #arr: any[] = [];
  #next = 0;
  get(idx: PyWorkRef): any {
    return this.#arr[idx];
  }
  del(idx: PyWorkRef): void {
    this.#arr[idx] = this.#next;
    this.#next = idx;
  }
  add(obj: any): PyWorkRef {
    if (this.#next === this.#arr.length) this.#arr.push(this.#arr.length + 1);
    const idx = this.#next;
    this.#next = this.#arr[idx];
    this.#arr[idx] = obj;
    return idx as PyWorkRef;
  }
}

await WorkerLive.pipe(
  Layer.provide(BrowserRunner.layer),
  Layer.launch,
  E.provideServiceEffect(OcrCorePyodide, makeOcrCorePyodide),
  E.provideService(ProxyStore, new ProxyStoreImpl),
  E.runPromise,
);

function isLittleEndian(): boolean {
  return new Uint8Array(Uint16Array.of(1).buffer)[0] === 1;
}
