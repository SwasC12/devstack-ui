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

  get isSuperAdmin(): boolean {
    return this.auth.getUser()?.role === 'superadmin';
  }

  get shop() {
    return this.auth.getShop();
  }

  get isEmployee(): boolean {
    return this.auth.isLoggedIn && !this.isAdmin;
  }

  logout(): void {
    const isSuper = this.auth.getUser()?.role === 'superadmin';
    this.auth.logout();
    this.router.navigate([isSuper ? '/platform' : '/menu']);
  }
}
