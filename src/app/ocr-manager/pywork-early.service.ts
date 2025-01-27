import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class PyworkEarlyService {
  readonly worker!: Worker;
  constructor() {
    if (typeof Worker !== 'undefined') {
      this.worker = new Worker(new URL('./pywork.worker.ts', import.meta.url));
      this.worker.addEventListener('error', ev => {
        const err = new Error("worker error", { cause: ev })
        if (ev.message.includes('not_little_endian')) {
          (err as any).snackbarMessageOverride = "This app only works on little-endian systems.";
        };
        throw err;
      });
    } else {
      Object.defineProperty(this, 'worker', {
        get() {
          throw Error("attempt to access webworker on server-side");
        }
      });
    }
  }
}
