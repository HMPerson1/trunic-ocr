import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatTableModule } from '@angular/material/table';
import { MatTooltip } from '@angular/material/tooltip';
import { example_inputs } from '../example-inputs.json';
import { PRONUNCIATION_SYSTEMS } from '../trunic-data';

@Component({
  selector: 'app-info-dialog',
  imports: [MatDialogModule, MatButtonModule, MatTableModule, NgTemplateOutlet, MatTooltip],
  templateUrl: './info-dialog.component.html',
  styleUrl: './info-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InfoDialogComponent {
  readonly _EXAMPLE_INPUTS = example_inputs;
  readonly _PNS = PRONUNCIATION_SYSTEMS;
}
