import { Component } from "@angular/core"
import { RouterLink, RouterLinkActive } from "@angular/router"
import { NgIcon, provideIcons } from "@ng-icons/core"
import {
  lucideHouse,
  lucideContactRound,
  lucideUsersRound,
  lucideFileText,
  lucideCalendarDays,
  lucideShieldCheck
} from "@ng-icons/lucide"
import { HlmSidebarImports } from "@spartan-ng/helm/sidebar"

@Component({
  selector: "app-admin-sidebar",
  imports: [RouterLink, RouterLinkActive, NgIcon, HlmSidebarImports],
  providers: [
    provideIcons({
      lucideHouse,
      lucideContactRound,
      lucideUsersRound,
      lucideFileText,
      lucideCalendarDays,
      lucideShieldCheck
    })
  ],
  host: { class: "contents" },
  styleUrl: "./admin-sidebar.css",
  template: `
    <hlm-sidebar sidebarContainerClass="group-data-[side=left]:border-r-0">
      <div hlmSidebarHeader class="sidebar-brand">
        <span class="brand-mark" aria-hidden="true">RM</span>
        <div class="brand-copy">
          <p class="brand-name">The Real Maids</p>
          <p class="brand-subtitle">Administración</p>
        </div>
      </div>
      <div hlmSidebarContent class="sidebar-content">
        <nav aria-label="Navegación administrativa">
          <div hlmSidebarGroup class="module-group" role="group" aria-label="General">
            <div hlmSidebarGroupLabel class="module-label">General</div>
            <ul hlmSidebarMenu class="module-menu">
              @for (module of placeholders; track module.label) {
                <li hlmSidebarMenuItem>
                  @if (module.label === "CRM") {
                    <a
                      hlmSidebarMenuButton
                      class="module-button"
                      routerLink="/admin/customers"
                      routerLinkActive
                      #crm="routerLinkActive"
                      [isActive]="crm.isActive"
                      ariaCurrentWhenActive="page"
                      [closeMobileSidebarOnClick]="true"
                    >
                      <ng-icon [name]="module.icon" size="18" aria-hidden="true" />
                      <span>{{ module.label }}</span>
                      <span class="active-dot" aria-hidden="true"></span>
                    </a>
                  } @else if (module.label === "RRHH") {
                    <a
                      hlmSidebarMenuButton
                      class="module-button"
                      routerLink="/admin/staff"
                      routerLinkActive
                      #rrhh="routerLinkActive"
                      [isActive]="rrhh.isActive"
                      ariaCurrentWhenActive="page"
                      [closeMobileSidebarOnClick]="true"
                    >
                      <ng-icon [name]="module.icon" size="18" aria-hidden="true" />
                      <span>{{ module.label }}</span>
                      <span class="active-dot" aria-hidden="true"></span>
                    </a>
                  } @else {
                    <button hlmSidebarMenuButton type="button" disabled class="module-button">
                      <ng-icon [name]="module.icon" size="18" aria-hidden="true" />
                      <span>{{ module.label }}</span>
                    </button>
                  }
                </li>
              }
            </ul>
          </div>
          <div
            hlmSidebarGroup
            class="module-group administration-group"
            role="group"
            aria-label="Administración"
          >
            <div hlmSidebarGroupLabel class="module-label">Administración</div>
            <ul hlmSidebarMenu class="module-menu">
              <li hlmSidebarMenuItem>
                <a
                  hlmSidebarMenuButton
                  class="module-button"
                  routerLink="/admin/users"
                  routerLinkActive
                  #iam="routerLinkActive"
                  [isActive]="iam.isActive"
                  ariaCurrentWhenActive="page"
                  [closeMobileSidebarOnClick]="true"
                >
                  <ng-icon name="lucideShieldCheck" size="18" aria-hidden="true" />
                  <span>IAM</span>
                  <span class="active-dot" aria-hidden="true"></span>
                </a>
              </li>
            </ul>
          </div>
        </nav>
      </div>
    </hlm-sidebar>
  `
})
export class AdminSidebar {
  readonly placeholders = [
    { label: "Landing", icon: "lucideHouse" },
    { label: "CRM", icon: "lucideContactRound" },
    { label: "RRHH", icon: "lucideUsersRound" },
    { label: "Cotizaciones", icon: "lucideFileText" },
    { label: "Programaciones", icon: "lucideCalendarDays" }
  ]
}
