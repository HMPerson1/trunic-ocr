/// <reference lib="webworker" />

import { loadPyodide } from "pyodide";
import { type PyBuffer, type PyGenerator, type PyIterator, type PyProxy } from "pyodide/ffi";
import type { PyWorkProgress, PyWorkRef, PyWorkRequest, PyWorkResponse } from "./worker-api";

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
      const [, pypkg] = await init;
      const perfTiming_start = performance.now();
      {
        const pmsg: PyWorkProgress = { type: 'p', id: data.id, progress: [0, undefined, performance.now() - perfTiming_start] };
        postMessage(pmsg);
      }
      const pyGen: PyGenerator & PyIterator = pypkg.oneshotRecognize(proxyStore.get(data.data as PyWorkRef));
      for (let i = 1; i <= 12; i++) {
        const iterRes = pyGen.next();
        if (!(!iterRes.done && iterRes.value === i)) throw new Error("bad py yield");
        await new Promise(resolve => setTimeout(resolve));
        if (pendingInterrupts.delete(data.id)) {
          const msg: PyWorkResponse = { type: 'r', id: data.id, data: undefined };
          postMessage(msg);
          return;
        }
        const pmsg: PyWorkProgress = { type: 'p', id: data.id, progress: [i/26, undefined, performance.now() - perfTiming_start] };
        postMessage(pmsg);
      }

      const iterRes13: IteratorResult<PyProxy> = pyGen.next();
      if (iterRes13.done) throw new Error("bad py yield");
      const [pyYieldI, geomData] = iterRes13.value.toJs({ create_pyproxies: false, dict_converter: Object.fromEntries });
      iterRes13.value.destroy();
      if (!(pyYieldI === 13)) throw new Error("bad py yield");
      await new Promise(resolve => setTimeout(resolve));
      if (pendingInterrupts.delete(data.id)) {
        const msg: PyWorkResponse = { type: 'r', id: data.id, data: undefined };
        postMessage(msg);
        return;
      }
      const pmsg: PyWorkProgress = { type: 'p', id: data.id, progress: [0.5, geomData, performance.now() - perfTiming_start] };
      postMessage(pmsg);

      const pyRet = await (async () => {
        while (true) {
          const iterRes: IteratorResult<any, PyProxy> = pyGen.next();
          if (iterRes.done) return iterRes.value;
          await new Promise(resolve => setTimeout(resolve));
          if (pendingInterrupts.delete(data.id)) {
            const msg: PyWorkResponse = { type: 'r', id: data.id, data: undefined };
            postMessage(msg);
            return;
          }
          const pmsg: PyWorkProgress = { type: 'p', id: data.id, progress: [0.5 + (iterRes.value + 1)/24, undefined, performance.now() - perfTiming_start] };
          postMessage(pmsg);
        }
      })();
      if (pyRet === undefined) return;

      const [glyphStrokesPy, glyphOriginsPy]: [PyBuffer, PyBuffer] = pyRet.toJs({ depth: 1 });
      pyRet.destroy();
      const glyphStrokesBy = glyphStrokesPy.getBuffer();
      glyphStrokesPy.destroy();
      if (!(glyphStrokesBy.shape.length == 2 && glyphStrokesBy.shape[1] == 2 && glyphStrokesBy.data instanceof Uint8Array && glyphStrokesBy.c_contiguous)) throw new Error("bad py buffer");
      const glyphStrokes = new Uint8Array(glyphStrokesBy.data);
      glyphStrokesBy.release();
      const glyphOriginsBy = glyphOriginsPy.getBuffer();
      glyphOriginsPy.destroy();
      if (!(glyphOriginsBy.shape.length == 2 && glyphOriginsBy.shape[1] == 2 && glyphOriginsBy.data instanceof Int32Array && glyphOriginsBy.c_contiguous)) throw new Error("bad py buffer");
      const glyphOrigins = new Int32Array(glyphOriginsBy.data);
      glyphOriginsBy.release();

      {
        const pmsg: PyWorkProgress = { type: 'p', id: data.id, progress: [1, undefined, performance.now() - perfTiming_start] };
        postMessage(pmsg);
      }

      const msg: PyWorkResponse = { type: 'r', id: data.id, data: [geomData, glyphStrokes, glyphOrigins] };
      postMessage(msg, [glyphStrokes.buffer, glyphOrigins.buffer]);
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
