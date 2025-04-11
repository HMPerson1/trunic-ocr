import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CroppedImageRendererCanvasComponent } from './cropped-image-renderer-canvas.component';

describe('CroppedImageRendererCanvasComponent', () => {
  let component: CroppedImageRendererCanvasComponent;
  let fixture: ComponentFixture<CroppedImageRendererCanvasComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CroppedImageRendererCanvasComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CroppedImageRendererCanvasComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
