import { Component, inject } from '@angular/core';
import { LoadingService } from './loading.service';

// Global loader. Standalone + reusable: mount <app-loader /> once in the app
// shell, then let the HTTP interceptor / router drive it automatically, or use
// LoadingService.show()/hide()/run() manually anywhere.
@Component({
  selector: 'app-loader',
  standalone: true,
  templateUrl: './app-loader.component.html',
  styleUrl: './app-loader.component.scss',
})
export class AppLoaderComponent {
  loading = inject(LoadingService);
}
