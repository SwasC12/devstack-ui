import { Component, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  auth = inject(AuthService);
  router = inject(Router);

  get isAdmin(): boolean {
    return this.auth.getUser()?.role === 'admin';
  }

  get isEmployee(): boolean {
    return this.auth.isLoggedIn && !this.isAdmin;
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/menu']);
  }
}
