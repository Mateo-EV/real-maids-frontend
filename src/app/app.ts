import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  // imports: [RouterOutlet],
  selector: 'app-root',
  template: ` <h1>Hola bro</h1> `,
})
export class App {
  protected readonly title = signal('real-maids-frontend');
}
