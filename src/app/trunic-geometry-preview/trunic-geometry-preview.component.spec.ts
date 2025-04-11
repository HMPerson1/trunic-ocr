import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TrunicGeometryPreviewComponent } from './trunic-geometry-preview.component';

describe('TrunicGeometryPreviewComponent', () => {
  let component: TrunicGeometryPreviewComponent;
  let fixture: ComponentFixture<TrunicGeometryPreviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TrunicGeometryPreviewComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TrunicGeometryPreviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
