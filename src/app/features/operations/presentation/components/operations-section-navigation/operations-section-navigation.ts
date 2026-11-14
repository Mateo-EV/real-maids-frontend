import { ChangeDetectionStrategy, Component } from "@angular/core"
import { RouterLink, RouterLinkActive } from "@angular/router"

/**
 * Route tabs of the Operaciones frame, mirroring the CRM catalog navigation so both shells
 * share one visual language: real links, one active page, coral underline, no fake tabs.
 */
@Component({
  selector: "app-operations-section-navigation",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="border-b bg-card px-4 sm:px-6" aria-label="Secciones de operaciones">
      <div class="flex flex-wrap items-center gap-x-4">
        <a
          routerLink="/admin/operations/requests"
          routerLinkActive="active-catalog"
          [routerLinkActiveOptions]="{
            paths: 'subset',
            queryParams: 'ignored',
            matrixParams: 'ignored',
            fragment: 'ignored'
          }"
          ariaCurrentWhenActive="page"
          >Solicitudes</a
        >
        <a
          routerLink="/admin/operations/orders"
          routerLinkActive="active-catalog"
          [routerLinkActiveOptions]="{
            paths: 'subset',
            queryParams: 'ignored',
            matrixParams: 'ignored',
            fragment: 'ignored'
          }"
          ariaCurrentWhenActive="page"
          >Órdenes</a
        >
        <a
          routerLink="/admin/operations/agenda"
          routerLinkActive="active-catalog"
          [routerLinkActiveOptions]="{
            paths: 'subset',
            queryParams: 'ignored',
            matrixParams: 'ignored',
            fragment: 'ignored'
          }"
          ariaCurrentWhenActive="page"
          >Agenda</a
        >
      </div>
    </nav>
  `,
  styles: `
    a {
      display: inline-flex;
      padding-block: 0.75rem;
      border-bottom: 3px solid transparent;
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--muted-foreground);
    }
    a:hover,
    .active-catalog {
      color: var(--primary);
    }
    .active-catalog {
      border-bottom-color: var(--coral);
    }
    a:focus-visible {
      outline: 2px solid var(--ring);
      outline-offset: 3px;
    }
  `
})
export class OperationsSectionNavigation {}
