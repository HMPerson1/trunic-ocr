import { Injectable } from '@angular/core';
import { Subject, type Observable } from 'rxjs';
import type { PyWorkProgress, PyWorkRef, PyWorkRequest, PyWorkResponse } from './worker-api.ts';

@Injectable({
  providedIn: 'root'
})
export class PyworkService {
  readonly worker = new Worker(new URL("./pywork.worker.ts", import.meta.url));
  readonly #activeRequests = new Map<number, RequestEntry>();

  constructor() {
    this.worker.onerror = (ev) => console.error("worker error", ev);
    this.worker.onmessageerror = (ev) => console.error("worker message error", ev);
    this.worker.onmessage = ({ data }: { data: PyWorkProgress | PyWorkResponse }) => {
      switch (data.type) {
        case 'p': {
          const entry = this.#activeRequests.get(data.id)
          if (entry === undefined) throw new Error("unknown id", { cause: data });
          entry.progress?.(data.progress);
          break;
        }
        case 'r': {
          const entry = this.#activeRequests.get(data.id)
          if (entry === undefined) throw new Error("unknown id", { cause: data });
          entry.resolve(data.data);
          this.#activeRequests.delete(data.id);
          break;
        }
        default:
          throw new Error("malformed message", { cause: data })
      }
    }
  }

  decodeImage(imgBlob: Blob): Promise<PyDecodedImageRef | undefined> {
    const reqId = genReqId();
    const { promise, resolve } = Promise.withResolvers();
    this.#activeRequests.set(reqId, { resolve, progress: undefined });
    const msg: PyWorkRequest = { id: reqId, name: 'decodeImage', data: imgBlob };
    this.worker.postMessage(msg);
    return promise as Promise<PyDecodedImageRef>;
  }

  decoded2bitmap(imgRef: PyDecodedImageRef): Promise<ImageBitmap> {
    const reqId = genReqId();
    const { promise, resolve } = Promise.withResolvers();
    this.#activeRequests.set(reqId, { resolve, progress: undefined });
    const msg: PyWorkRequest = { id: reqId, name: 'decoded2bitmap', data: imgRef };
    this.worker.postMessage(msg);
    return promise as Promise<ImageBitmap>;
  }

  loadBitmap(bmp: ImageBitmap): Promise<PyDecodedImageRef> {
    const reqId = genReqId();
    const { promise, resolve } = Promise.withResolvers();
    this.#activeRequests.set(reqId, { resolve, progress: undefined });
    const msg: PyWorkRequest = { id: reqId, name: 'loadBitmap', data: bmp };
    this.worker.postMessage(msg);
    return promise as Promise<PyDecodedImageRef>;
  }

  oneshotRecognize(imgRef: PyDecodedImageRef): [Promise<[GlyphGeometry, Uint8Array, Float64Array]>, Observable<number>] {
    const reqId = genReqId();
    const progOut = new Subject<number>()
    const { promise, resolve } = Promise.withResolvers();
    promise.then(() => progOut.complete());
    this.#activeRequests.set(reqId, { resolve, progress: v => progOut.next((v as any)[0]) });
    const msg: PyWorkRequest = { id: reqId, name: 'oneshotRecognize', data: imgRef };
    this.worker.postMessage(msg);
    return [promise as Promise<[GlyphGeometry, Uint8Array, Float64Array]>, progOut.asObservable()];
  }

  destroy(imgRef: PyDecodedImageRef): Promise<void> {
    const reqId = genReqId();
    const { promise, resolve } = Promise.withResolvers();
    this.#activeRequests.set(reqId, { resolve, progress: undefined });
    const msg: PyWorkRequest = { id: reqId, name: 'destroy', data: imgRef };
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

type RequestEntry = { resolve: (d: unknown) => void, progress?: (p: unknown) => void };

function genReqId(): number {
  return (Math.random() * (2 ** 31)) | 0
}
