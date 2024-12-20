import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TrunicGlyphDetailComponent } from './trunic-glyph-detail.component';

describe('TrunicGlyphDetailComponent', () => {
  let component: TrunicGlyphDetailComponent;
  let fixture: ComponentFixture<TrunicGlyphDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TrunicGlyphDetailComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TrunicGlyphDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
