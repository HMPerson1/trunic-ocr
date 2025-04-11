import { Directive } from '@angular/core';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';
import { InfoDialogComponent } from './info-dialog.component';

@Directive({
  selector: '[appInfoDialogOpenButton]',
  host: { '(click)': 'onClick()' },
})
export class InfoDialogOpenButtonDirective {
  constructor(private readonly matDialog: MatDialog) { }
  #lastOpenInfoDialog: MatDialogRef<InfoDialogComponent> | undefined = undefined;
  onClick() {
    this.#lastOpenInfoDialog?.close();
    this.#lastOpenInfoDialog = this.matDialog.open(InfoDialogComponent, { autoFocus: 'dialog' });
  }
}
