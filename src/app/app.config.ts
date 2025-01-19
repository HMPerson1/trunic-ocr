import { ApplicationConfig, ErrorHandler, provideZoneChangeDetection } from '@angular/core';
import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';
import { provideClientHydration, withIncrementalHydration } from '@angular/platform-browser';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { SnackbarErrorHandlerService } from './misc/snackbar-error-handler.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideAnimationsAsync(),
    { provide: ErrorHandler, useClass: SnackbarErrorHandlerService },
    { provide: MAT_ICON_DEFAULT_OPTIONS, useValue: { fontSet: 'material-symbols-outlined' } },
    provideClientHydration(withIncrementalHydration()),
  ],
};
