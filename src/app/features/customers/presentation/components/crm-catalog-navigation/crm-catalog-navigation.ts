import { ChangeDetectionStrategy, Component } from "@angular/core"
import { RouterLink, RouterLinkActive } from "@angular/router"

@Component({
  selector: "app-crm-catalog-navigation",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="border-b bg-card px-4 sm:px-6" aria-label="Catálogos CRM">
      <div class="flex flex-wrap items-center gap-x-4">
        <a
          routerLink="/admin/customers"
          routerLinkActive="active-catalog"
          [routerLinkActiveOptions]="{
            paths: 'exact',
            queryParams: 'ignored',
            matrixParams: 'ignored',
            fragment: 'ignored'
          }"
          ariaCurrentWhenActive="page"
          >Clientes</a
        >
        <a
          routerLink="/admin/customers/leads"
          routerLinkActive="active-catalog"
          ariaCurrentWhenActive="page"
          >Prospectos</a
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
export class CrmCatalogNavigation {}
