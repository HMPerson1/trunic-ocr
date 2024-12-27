/// <reference lib="webworker" />

import { loadPyodide, type PyodideInterface } from "pyodide";
import type { PyBuffer, PyGenerator, PyIterator, PyProxy, TypedArray } from "pyodide/ffi";
import type { PyWorkError, PyWorkProgress, PyWorkRef, PyWorkRequest, PyWorkResponse } from "./worker-api";

if (!isLittleEndian()) {
  throw new Error('not_little_endian');
}

const init = (async () => {
  const [pyodide, trunicOcrWheel] = await Promise.all([
    loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/", packages: ["numpy", "opencv-python"] }),
    fetch("trunic_ocr_core-0.1.0-py3-none-any.whl").then(v => v.arrayBuffer())]);
  pyodide.unpackArchive(trunicOcrWheel, 'wheel');
  const pypkg = pyodide.pyimport('trunic_ocr_core');
  return [pyodide, pypkg] as const;
})();

const proxyStore = new (class {
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
})();

const pendingInterrupts = new Set<number>();

onmessage = async ({ data }: { data: PyWorkRequest }) => {
  switch (data.name) {
    case 'decodeImage': {
      const [py, pypkg] = await init;
      const pynparr1: PyBuffer | undefined = pypkg.decodeImage(py.toPy(await (data.data as Blob).arrayBuffer()));
      if (pynparr1 == null) {
        console.warn("opencv could not decode image");
      }
      const msg: PyWorkResponse = { type: 'r', id: data.id, data: pynparr1 != null ? proxyStore.add(pynparr1) : undefined };
      postMessage(msg);
      return;
    }
    case 'decoded2bitmap': {
      const [, pypkg] = await init;
      const pynparr2: PyBuffer = pypkg.image2Rgba(proxyStore.get(data.data as PyWorkRef));
      const bufview = pynparr2.getBuffer();
      pynparr2.destroy();
      const [h, w, d] = bufview.shape;
      if (!(bufview.shape.length === 3 && d === 4 && bufview.data instanceof Uint8Array && bufview.c_contiguous)) throw new Error("bad py buffer");
      const bmp = await createImageBitmap(new ImageData(new Uint8ClampedArray(bufview.data.buffer, bufview.data.byteOffset, bufview.data.length), w));
      bufview.release();
      const msg: PyWorkResponse = { type: 'r', id: data.id, data: bmp };
      postMessage(msg, [bmp]);
      return;
    }
    case 'loadBitmap': {
      const [py, pypkg] = await init;
      const bmp = data.data as ImageBitmap;
      const canvas = new OffscreenCanvas(bmp.width, bmp.height);
      const canvasCtx = canvas.getContext('2d', { willReadFrequently: true })!;
      canvasCtx.drawImage(bmp, 0, 0);
      const bmpData = canvasCtx.getImageData(0, 0, bmp.width, bmp.height);
      const pynparr1: PyBuffer = pypkg.loadBitmap(py.toPy(bmpData.data), bmpData.width, bmpData.height);
      const msg: PyWorkResponse = { type: 'r', id: data.id, data: proxyStore.add(pynparr1) };
      postMessage(msg);
      return;
    }
    case 'oneshotRecognize': {
      const [py, pypkg] = await init;
      const interruptedToken = Symbol();
      try {
        await impl_oneshotRecognize(py, pypkg, data.data as any, mkPostProgress(data.id, interruptedToken));
        const msg: PyWorkResponse = { type: 'r', id: data.id, data: undefined };
        postMessage(msg);
      } catch (e) {
        if (Object.is(interruptedToken, e)) {
          const msg: PyWorkError = { type: 'e', id: data.id, data: undefined };
          postMessage(msg);
        } else {
          console.error(e);
          const msg: PyWorkError = { type: 'e', id: data.id, data: String(e) };
          postMessage(msg);
        }
      }
      return;
    }
    case 'destroy': {
      await init;
      const ref = data.data as PyWorkRef;
      const pyobj: PyProxy = proxyStore.get(ref);
      proxyStore.del(ref);
      pyobj.destroy();
      const msg: PyWorkResponse = { type: 'r', id: data.id, data: undefined };
      postMessage(msg);
      break;
    }
    case 'interrupt': {
      pendingInterrupts.add(data.data as number);
      const msg: PyWorkResponse = { type: 'r', id: data.id, data: undefined };
      postMessage(msg);
      break;
    }
    default:
      throw new Error("unknown name", { cause: data });
  }
}

async function impl_oneshotRecognize(_py: PyodideInterface, pypkg: any, data: PyWorkRef, postProgress: PostProgressFn<[number, any, number]>) {
  try {
    await impl_oneshotRecognize_real(_py, pypkg, data, false, postProgress);
  } catch (e) {
    console.warn("python exception; retrying");
    console.warn(e);
    await impl_oneshotRecognize_real(_py, pypkg, data, true, postProgress);
  }
}

async function impl_oneshotRecognize_real(_py: PyodideInterface, pypkg: any, data: PyWorkRef, lax: boolean, postProgress: PostProgressFn<[number, any, number]>) {
  const perfTiming_start = performance.now();
  postProgress([0, undefined, performance.now() - perfTiming_start], { alsoYield: false });

  const [strokesPx, geomPx, tmplPx, originsPx] = await (async () => {
    const pyGen: PyGenerator & PyIterator = pypkg.findGlyphs.callKwargs(proxyStore.get(data), lax ? { lax: true } : {});
    try {
      for (let i = 1; i <= 12; i++) {
        const iterRes = pyGen.next();
        if (!(!iterRes.done && iterRes.value === i)) throw new Error("bad py yield");
        await postProgress([i / 26, undefined, performance.now() - perfTiming_start]);
      }

      const iterRet: IteratorResult<any, PyProxy> = pyGen.next();
      if (!iterRet.done) throw new Error("bad py yield");
      const [strokesPx, geomPx, tmplPx, originsPx] = iterRet.value.toJs({ depth: 1 });
      iterRet.value.destroy();
      return [strokesPx, geomPx, tmplPx, originsPx];
    } finally {
      pyGen.return(undefined);
      pyGen.destroy();
    }
  })();

  const geomPodPx = geomPx.to_pod();
  const geomData = geomPodPx.toJs({ create_pyproxies: false, dict_converter: Object.fromEntries });
  geomPodPx.destroy();
  await postProgress([0.5, { t: 0, v: geomData }, performance.now() - perfTiming_start]);

  {
    const pyGen: PyGenerator & PyIterator = pypkg.fitGlyphs(strokesPx, geomPx, tmplPx, originsPx);
    try {
      const glyphsCount = originsPx.length;
      originsPx.destroy();
      for (let i = 0; i < glyphsCount; i++) {
        const iterRes: IteratorResult<PyProxy> = pyGen.next();
        if (iterRes.done) throw new Error("bad py yield");
        const glyph = iterRes.value.toJs({ create_pyproxies: false, dict_converter: Object.fromEntries });
        iterRes.value.destroy();
        await postProgress([0.5 + (i + 1) / (2 * glyphsCount), { t: 1, v: glyph }, performance.now() - perfTiming_start]);
      }
      const iterRet = pyGen.next();
      if (!(iterRet.done && iterRet.value === undefined)) throw new Error("bad py yield");
    } finally {
      pyGen.return(undefined);
      pyGen.destroy();
    }
  }

  strokesPx.destroy();
  geomPx.destroy();
  tmplPx.destroy();
}

/** destroys `pypx` */
function convert2dTypedArray<T extends TypedArray>(pypx: PyBuffer, ty: new (t: T) => T): T {
  const pybuf = pypx.getBuffer();
  pypx.destroy();
  if (!(pybuf.shape.length == 2 && pybuf.shape[1] == 2 && pybuf.data instanceof ty && pybuf.c_contiguous)) throw new Error("bad py buffer");
  const ret = new ty(pybuf.data);
  pybuf.release();
  return ret;
}

type PostProgressFn<T = unknown> =
  <const Opts extends { alsoYield?: boolean }>(progress: T, opts?: Opts)
    => Opts['alsoYield'] extends false ? undefined : Promise<undefined>;
const mkPostProgress = (id: number, interruptedToken: unknown): PostProgressFn => ((data: unknown, { alsoYield = true } = {}) => {
  const pmsg: PyWorkProgress = { type: 'p', id, data };
  postMessage(pmsg);
  if (alsoYield) {
    return (async () => {
      await new Promise(resolve => setTimeout(resolve));
      if (pendingInterrupts.delete(id)) throw interruptedToken;
    })();
  }
  return;
}) as any;

function isLittleEndian(): boolean {
  return new Uint8Array(Uint16Array.of(1).buffer)[0] === 1;
}
