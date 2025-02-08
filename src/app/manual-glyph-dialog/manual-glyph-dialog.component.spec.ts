import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ManualGlyphDialogComponent } from './manual-glyph-dialog.component';

describe('ManualGlyphDialogComponent', () => {
  let component: ManualGlyphDialogComponent;
  let fixture: ComponentFixture<ManualGlyphDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManualGlyphDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ManualGlyphDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
