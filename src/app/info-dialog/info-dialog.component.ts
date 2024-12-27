import { NgTemplateOutlet } from '@angular/common';
import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatTableModule } from '@angular/material/table';
import { example_inputs } from '../example-inputs.json';

@Component({
  selector: 'app-info-dialog',
  imports: [MatDialogModule, MatButtonModule, MatTableModule, NgTemplateOutlet],
  templateUrl: './info-dialog.component.html',
  styleUrl: './info-dialog.component.scss'
})
export class InfoDialogComponent {
  readonly _EXAMPLE_INPUTS = example_inputs;
}