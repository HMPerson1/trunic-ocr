import { TestBed } from '@angular/core/testing';

import { PyworkService } from './pywork.service';

describe('PyworkService', () => {
  let service: PyworkService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PyworkService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
