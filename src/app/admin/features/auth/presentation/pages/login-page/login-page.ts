import { Component } from '@angular/core';
import { LoginForm } from '../../components/login-form/login-form';

@Component({
  imports: [LoginForm],
  selector: 'app-login-page',
  templateUrl: './login-page.html',
  styleUrl: './login-page.css',
})
export class LoginPage {}
