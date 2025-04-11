import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OcrOverlayComponent } from './ocr-overlay.component';

describe('OcrOverlayComponent', () => {
  let component: OcrOverlayComponent;
  let fixture: ComponentFixture<OcrOverlayComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OcrOverlayComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OcrOverlayComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
