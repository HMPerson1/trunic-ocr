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
    // FIXME: free
    case 'decodeImage': {
      const [py, pypkg] = await init;
      const pynparr1: PyBuffer = pypkg.decodeImage(py.toPy(await (data.data as Blob).arrayBuffer()));
      const msg: PyWorkResponse = { type: 'r', id: data.id, data: proxyStore.add(pynparr1) };
      postMessage(msg);
      break;
    }
    case 'decoded2bitmap': {
      const [, pypkg] = await init;
      const pynparr2: PyBuffer = pypkg.image2Rgba(proxyStore.get(data.data as PyWorkRef));
      const bufview = pynparr2.getBuffer();
      pynparr2.destroy();
      const [h, w, d] = bufview.shape;
      if (!(d === 4 && bufview.data instanceof Uint8Array)) throw new Error("bad py buffer")
      const bmp = await createImageBitmap(new ImageData(new Uint8ClampedArray(bufview.data.buffer, bufview.data.byteOffset, bufview.data.length), w));
      bufview.release();
      const msg: PyWorkResponse = { type: 'r', id: data.id, data: bmp };
      postMessage(msg, [bmp]);
      break;
    }
    case 'destroy': {
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
