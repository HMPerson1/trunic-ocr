import { Injectable, Injector } from '@angular/core';
import type { MatSnackBar } from '@angular/material/snack-bar';

@Injectable()
export class SnackbarErrorHandlerService {
  readonly #snackBarP: Promise<MatSnackBar>;
  constructor(injector: Injector) {
    this.#snackBarP = (async () => injector.get((await import('@angular/material/snack-bar')).MatSnackBar))();
  }
  handleError(error: any): void {
    console.error("ERROR", error);
    const msg = error?.snackbarMessageOverride ?? "An unexpected error has occurred.";
    this.#snackBarP.then(b => b.open(msg, undefined, { duration: 5000 }));
  }
}
