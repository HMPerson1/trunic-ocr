import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TrunicGlyphComponent } from './trunic-glyph.component';

describe('TrunicGlyphComponent', () => {
  let component: TrunicGlyphComponent;
  let fixture: ComponentFixture<TrunicGlyphComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TrunicGlyphComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TrunicGlyphComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
