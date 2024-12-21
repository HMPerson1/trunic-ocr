import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TrunicGlyphImageComponent } from './trunic-glyph-image.component';

describe('TrunicGlyphImageComponent', () => {
  let component: TrunicGlyphImageComponent;
  let fixture: ComponentFixture<TrunicGlyphImageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TrunicGlyphImageComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TrunicGlyphImageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
