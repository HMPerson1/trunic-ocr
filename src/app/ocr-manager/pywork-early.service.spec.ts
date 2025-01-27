import { TestBed } from '@angular/core/testing';

import { PyworkEarlyService } from './pywork-early.service';

describe('PyworkEarlyService', () => {
  let service: PyworkEarlyService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PyworkEarlyService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
