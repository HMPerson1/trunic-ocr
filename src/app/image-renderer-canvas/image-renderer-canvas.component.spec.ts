import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ImageRendererCanvasComponent } from './image-renderer-canvas.component';

describe('ImageRendererCanvasComponent', () => {
  let component: ImageRendererCanvasComponent;
  let fixture: ComponentFixture<ImageRendererCanvasComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ImageRendererCanvasComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ImageRendererCanvasComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
