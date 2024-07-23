/// <reference lib="webworker" />

import { loadPyodide } from "pyodide";
import { type PyBuffer, type PyProxy } from "pyodide/ffi";
import type { PyWorkRef, PyWorkRequest, PyWorkResponse } from "./worker-api";

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
      break;
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
      break;
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
      break;
    }
    case 'oneshotRecognize': {
      const [, pypkg] = await init;
      const pyRet: PyProxy = pypkg.oneshotRecognize(proxyStore.get(data.data as PyWorkRef));
      const [geomDataPy, glyphStrokesPy, glyphOriginsPy]: [PyProxy, PyBuffer, PyBuffer] = pyRet.toJs({ depth: 1 });
      pyRet.destroy();
      const geomData = geomDataPy.toJs({ create_pyproxies: false, dict_converter: Object.fromEntries });
      geomDataPy.destroy();
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

      const msg: PyWorkResponse = { type: 'r', id: data.id, data: [geomData, glyphStrokes, glyphOrigins] };
      postMessage(msg, [glyphStrokes.buffer, glyphOrigins.buffer]);
      break;
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
    default:
      throw new Error("unknown name", { cause: data });
  }
}
