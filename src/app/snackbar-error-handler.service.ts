import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable()
export class SnackbarErrorHandlerService {
  constructor(private readonly snackBar: MatSnackBar) { }
  handleError(error: any): void {
    console.error("ERROR", error);
    this.snackBar.open("An unexpected error has occured.");
  }
}
