import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OcrManualControlPanelComponent } from './ocr-manual-control-panel.component';

describe('OcrManualControlPanelComponent', () => {
  let component: OcrManualControlPanelComponent;
  let fixture: ComponentFixture<OcrManualControlPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OcrManualControlPanelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OcrManualControlPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
