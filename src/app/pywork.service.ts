import { Injectable } from '@angular/core';
import { Subject, type Observable } from 'rxjs';
import type { PyWorkError, PyWorkProgress, PyWorkRef, PyWorkRequest, PyWorkResponse } from './worker-api.ts';

@Injectable({
  providedIn: 'root'
})
export class PyworkService {
  readonly worker = new Worker(new URL("./pywork.worker.ts", import.meta.url));
  readonly #activeRequests = new Map<number, RequestEntry>();

  constructor() {
    this.worker.onerror = (ev) => console.error("worker error", ev);
    this.worker.onmessageerror = (ev) => console.error("worker message error", ev);
    this.worker.onmessage = ({ data }: { data: PyWorkProgress | PyWorkResponse | PyWorkError }) => {
      const entry = this.#activeRequests.get(data.id)
      if (entry === undefined) throw new Error("unknown id", { cause: data });
      switch (data.type) {
        case 'p': {
          if (entry.progress == null) {
            console.warn("unexpected progress", data.data);
          } else {
            entry.progress(data.data);
          }
          break;
        }
        case 'r': {
          entry.resolve(data.data);
          this.#activeRequests.delete(data.id);
          break;
        }
        case 'e': {
          if (entry.reject == null) {
            console.warn("unhandled reject", data.data);
          } else {
            entry.reject(data.data);
          }
          this.#activeRequests.delete(data.id);
          break;
        }
        default:
          const _never: never = data;
          throw new Error("malformed message", { cause: data })
      }
    }
  }

  decodeImage(imgBlob: Blob): Promise<PyDecodedImageRef | undefined> {
    const reqId = genReqId();
    const { promise, resolve } = Promise.withResolvers();
    this.#activeRequests.set(reqId, { resolve, progress: undefined, reject: undefined });
    const msg: PyWorkRequest = { id: reqId, name: 'decodeImage', data: imgBlob };
    this.worker.postMessage(msg);
    return promise as Promise<PyDecodedImageRef>;
  }

  decoded2bitmap(imgRef: PyDecodedImageRef): Promise<ImageBitmap> {
    const reqId = genReqId();
    const { promise, resolve } = Promise.withResolvers();
    this.#activeRequests.set(reqId, { resolve, progress: undefined, reject: undefined });
    const msg: PyWorkRequest = { id: reqId, name: 'decoded2bitmap', data: imgRef };
    this.worker.postMessage(msg);
    return promise as Promise<ImageBitmap>;
  }

  loadBitmap(bmp: ImageBitmap): Promise<PyDecodedImageRef> {
    const reqId = genReqId();
    const { promise, resolve } = Promise.withResolvers();
    this.#activeRequests.set(reqId, { resolve, progress: undefined, reject: undefined });
    const msg: PyWorkRequest = { id: reqId, name: 'loadBitmap', data: bmp };
    this.worker.postMessage(msg);
    return promise as Promise<PyDecodedImageRef>;
  }

  oneshotRecognize(imgRef: PyDecodedImageRef): [Promise<[GlyphGeometry, Uint8Array, Float64Array]>, Observable<number>, () => Promise<void>] {
    const reqId = genReqId();
    const progOut = new Subject<number>()
    const { promise, resolve, reject } = Promise.withResolvers();
    promise.finally(() => progOut.complete()); // don't also error the observable
    this.#activeRequests.set(reqId, { resolve, progress: v => progOut.next((v as any)[0]), reject });
    const msg: PyWorkRequest = { id: reqId, name: 'oneshotRecognize', data: imgRef };
    this.worker.postMessage(msg);
    const cancel = async () => { await this.interrupt(reqId); try { await promise; } catch { } }
    return [promise as Promise<[GlyphGeometry, Uint8Array, Float64Array]>, progOut.asObservable(), cancel];
  }

  destroy(imgRef: PyDecodedImageRef): Promise<void> {
    const reqId = genReqId();
    const { promise, resolve } = Promise.withResolvers();
    this.#activeRequests.set(reqId, { resolve, progress: undefined, reject: undefined });
    const msg: PyWorkRequest = { id: reqId, name: 'destroy', data: imgRef };
    this.worker.postMessage(msg);
    return promise as Promise<undefined>;
  }

  interrupt(targetReqId: number): Promise<void> {
    const reqId = genReqId();
    const { promise, resolve } = Promise.withResolvers();
    this.#activeRequests.set(reqId, { resolve, progress: undefined, reject: undefined });
    const msg: PyWorkRequest = { id: reqId, name: 'interrupt', data: targetReqId };
    this.worker.postMessage(msg);
    return promise as Promise<undefined>;
  }
}

declare const tag_decodedImage: unique symbol;
export type PyDecodedImageRef = PyWorkRef & { [tag_decodedImage]: null };

export type GlyphGeometry = {
  stroke_width: number,
  glyph_template_shape: [number, number],
  glyph_template_origin: [number, number],
  all_lines: Array<Array<[[number, number], [number, number]]>>,
  circle_center: [number, number],
}

type RequestEntry = { resolve: (d: unknown) => void, progress?: (d: unknown) => void, reject?: (d: unknown) => void };

function genReqId(): number {
  return (Math.random() * (2 ** 31)) | 0
}
