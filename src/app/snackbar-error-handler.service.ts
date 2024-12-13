import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable()
export class SnackbarErrorHandlerService {
  constructor(private readonly snackBar: MatSnackBar) { }
  handleError(error: unknown): void {
    console.error("ERROR", error);
    const msg =
      (typeof error === 'object'
        && error != null
        && 'snackbarMessageOverride' in error
        && typeof error.snackbarMessageOverride === 'string'
      )
        ? error.snackbarMessageOverride
        : "An unexpected error has occured.";
    this.snackBar.open(msg);
  }
}
