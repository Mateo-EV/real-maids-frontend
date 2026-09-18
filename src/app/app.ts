import { Component } from '@angular/core';
import { LoginPage } from './admin/features/auth/presentation/pages/login-page/login-page';

@Component({
  imports: [LoginPage],
  selector: 'app-root',
  template: '<app-login-page />',
})
export class App {}
