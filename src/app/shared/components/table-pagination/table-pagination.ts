import { Component, computed, input, output } from "@angular/core"
import {
  HlmPagination,
  HlmPaginationContent,
  HlmPaginationEllipsis,
  HlmPaginationItem,
  HlmPaginationLink
} from "@spartan-ng/helm/pagination"
import { pageTokens } from "@/app/shared/pagination/page-tokens"

@Component({
  selector: "app-table-pagination",
  imports: [
    HlmPagination,
    HlmPaginationContent,
    HlmPaginationEllipsis,
    HlmPaginationItem,
    HlmPaginationLink
  ],
  host: { class: "block min-w-0 max-w-full" },
  template: `
    <nav hlmPagination [aria-label]="label()">
      <ul hlmPaginationContent class="flex-wrap justify-center">
        <li hlmPaginationItem>
          <button hlmPaginationLink size="sm" type="button" aria-label="Página anterior"
            [disabled]="disabled() || currentPage() <= 1"
            (click)="selectPage(currentPage() - 1)">Anterior</button>
        </li>
        @for (token of tokens(); track token) {
          <li hlmPaginationItem>
            @if (isPage(token)) {
              <button hlmPaginationLink size="sm" type="button"
                [isActive]="token === currentPage()" [attr.aria-label]="'Página ' + token"
                [disabled]="disabled()" (click)="selectPage(token)">{{ token }}</button>
            } @else {
              <hlm-pagination-ellipsis srOnlyText="Más páginas" />
            }
          </li>
        }
        <li hlmPaginationItem>
          <button hlmPaginationLink size="sm" type="button" aria-label="Página siguiente"
            [disabled]="disabled() || currentPage() >= pageCount()"
            (click)="selectPage(currentPage() + 1)">Siguiente</button>
        </li>
      </ul>
    </nav>
  `
})
export class TablePagination {
  readonly currentPage = input.required<number>()
  readonly pageCount = input.required<number>()
  readonly disabled = input(false)
  readonly label = input("Paginación de tabla")
  readonly pageSelected = output<number>()
  protected readonly tokens = computed(() => pageTokens(this.currentPage(), this.pageCount()))

  protected isPage(token: number | string): token is number {
    return typeof token === "number"
  }

  protected selectPage(page: number): void {
    if (!this.disabled() && Number.isSafeInteger(page) && page >= 1 && page <= this.pageCount())
      this.pageSelected.emit(page)
  }
}
