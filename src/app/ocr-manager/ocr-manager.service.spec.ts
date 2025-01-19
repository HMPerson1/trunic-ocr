import { TestBed } from '@angular/core/testing';

import { OcrManagerService } from './ocr-manager.service';

describe('OcrManagerService', () => {
  let service: OcrManagerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(OcrManagerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
