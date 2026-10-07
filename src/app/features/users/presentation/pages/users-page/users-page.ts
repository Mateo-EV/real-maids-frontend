import { DatePipe, NgTemplateOutlet } from "@angular/common"
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal
} from "@angular/core"
import { Router, RouterLink } from "@angular/router"
import { NgIcon, provideIcons } from "@ng-icons/core"
import {
  lucideUsers,
  lucideSmartphone,
  lucideShield,
  lucideClipboardList,
  lucidePlus,
  lucidePencil,
  lucideKeyRound,
  lucideTrash2,
  lucideLogOut,
  lucideSearch
} from "@ng-icons/lucide"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmCardImports } from "@spartan-ng/helm/card"
import { HlmTableImports } from "@spartan-ng/helm/table"
import { HlmBadgeImports } from "@spartan-ng/helm/badge"
import { HlmAvatarImports } from "@spartan-ng/helm/avatar"
import { HlmInputImports } from "@spartan-ng/helm/input"
import { HlmNativeSelectImports } from "@spartan-ng/helm/native-select"
import { HlmEmptyImports } from "@spartan-ng/helm/empty"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { User } from "../../../domain/entities/user.entity"
import { UserStore } from "../../state/user.store"
import { RolesStore } from "../../state/roles.store"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { finalize, forkJoin } from "rxjs"
import { DEMO_METRICS, demoDecoration, initials } from "../../demo/users-demo.fixture"
import { UserEditor, UserEditorContext } from "../../components/user-editor/user-editor"
import {
  DeleteUserContext,
  DeleteUserDialog
} from "../../components/delete-user-dialog/delete-user-dialog"
import { HlmInputGroupImports } from "@spartan-ng/helm/input-group"
import { HotToastService } from "@ngxpert/hot-toast"
import { TablePagination } from "@/app/shared/components/table-pagination/table-pagination"

@Component({
  selector: "app-users-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    NgTemplateOutlet,
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmCardImports,
    HlmTableImports,
    HlmBadgeImports,
    HlmAvatarImports,
    HlmInputImports,
    HlmInputGroupImports,
    HlmNativeSelectImports,
    HlmEmptyImports,
    HlmAlertImports,
    HlmSpinnerImports,
    TablePagination
  ],
  providers: [
    provideIcons({
      lucideUsers,
      lucideSmartphone,
      lucideShield,
      lucideClipboardList,
      lucidePlus,
      lucidePencil,
      lucideKeyRound,
      lucideTrash2,
      lucideLogOut,
      lucideSearch
    })
  ],
  templateUrl: "./users-page.html",
  styleUrl: "./users-page.css"
})
export class UsersPage implements OnInit {
  readonly users = inject(UserStore)
  readonly roles = inject(RolesStore)
  private readonly auth = inject(AuthStore)
  private readonly router = inject(Router)
  private readonly destroyRef = inject(DestroyRef)
  private readonly dialogs = inject(HlmDialogService)
  private readonly toast = inject(HotToastService)
  readonly session = this.auth.session
  readonly metrics = DEMO_METRICS
  readonly initials = initials
  readonly decoration = demoDecoration
  readonly initializing = signal(false)
  readonly loadError = signal(false)
  readonly search = signal("")
  readonly roleFilter = signal("")
  readonly statusFilter = signal("all")
  private readonly requestedPage = signal(1)
  readonly pageSize = 5
  readonly activeCount = computed(() => this.users.users().filter(user => user.isActive).length)
  readonly filteredUsers = computed(() => {
    const query = this.search().trim().toLocaleLowerCase("es")
    return this.users
      .users()
      .filter(
        user =>
          (!query ||
            user.name.toLocaleLowerCase("es").includes(query) ||
            user.email.toLocaleLowerCase("es").includes(query)) &&
          (!this.roleFilter() || String(user.roleId) === this.roleFilter()) &&
          (this.statusFilter() === "all" || user.isActive === (this.statusFilter() === "active"))
      )
  })
  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.filteredUsers().length / this.pageSize))
  )
  readonly currentPage = computed(() => Math.min(this.requestedPage(), this.pageCount()))
  readonly visibleUsers = computed(() =>
    this.filteredUsers().slice(
      (this.currentPage() - 1) * this.pageSize,
      this.currentPage() * this.pageSize
    )
  )
  readonly rangeStart = computed(() =>
    this.filteredUsers().length ? (this.currentPage() - 1) * this.pageSize + 1 : 0
  )
  readonly rangeEnd = computed(() =>
    Math.min(this.currentPage() * this.pageSize, this.filteredUsers().length)
  )

  ngOnInit(): void {
    this.retry()
  }

  retry(): void {
    if (this.destroyRef.destroyed || this.initializing()) return
    this.initializing.set(true)
    this.loadError.set(false)
    forkJoin({ roles: this.roles.loadRoles(), users: this.users.loadUsers() })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (!this.destroyRef.destroyed) this.initializing.set(false)
        })
      )
      .subscribe({
        next: result => {
          if (!this.destroyRef.destroyed)
            this.loadError.set(!result.roles.success || !result.users.success)
        },
        error: () => {
          if (!this.destroyRef.destroyed) this.loadError.set(true)
        }
      })
  }

  setSearch(value: string): void {
    this.search.set(value)
    this.requestedPage.set(1)
  }
  setRoleFilter(value: string | null | undefined): void {
    this.roleFilter.set(value ?? "")
    this.requestedPage.set(1)
  }
  setStatusFilter(value: string | null | undefined): void {
    this.statusFilter.set(value ?? "all")
    this.requestedPage.set(1)
  }
  clearFilters(): void {
    this.setSearch("")
    this.setRoleFilter("")
    this.setStatusFilter("all")
  }
  goToPage(page: number): void {
    this.requestedPage.set(Math.max(1, Math.min(page, this.pageCount())))
  }
  roleName(user: User): string {
    const role = this.roles.roles().find(item => item.id === user.roleId)
    return role ? `${role.name}${role.isActive ? "" : " (inactivo)"}` : "Rol no disponible"
  }

  // FICTITIOUS DEMO DATA: screenshot avatar decoration only, never identity or permissions.
  avatarTone(user: User): string {
    const reference: Readonly<Record<string, string>> = {
      "persona.1@example.test": "navy",
      "persona.2@example.test": "coral",
      "persona.3@example.test": "green",
      "persona.4@example.test": "amber",
      "persona.5@example.test": "neutral"
    }
    return (
      reference[user.email] ??
      this.decorativeTone(user.email, ["navy", "coral", "green", "amber", "neutral"])
    )
  }

  // Role names choose decoration, not ACL. IDs, order and active state never choose the hue.
  roleTone(user: User): string {
    const name = this.roles.roles().find(role => role.id === user.roleId)?.name
    if (!name) return "neutral"
    const reference: Readonly<Record<string, string>> = {
      administración: "purple",
      operaciones: "blue",
      "personal campo": "green",
      "cliente (portal)": "amber",
      supervisión: "purple"
    }
    const label = name.trim().toLocaleLowerCase("es")
    return reference[label] ?? this.decorativeTone(label, ["purple", "blue", "green", "amber"])
  }

  private decorativeTone(label: string, tones: readonly string[]): string {
    const hash = Array.from(label).reduce(
      (value, character) => (value * 31 + character.codePointAt(0)!) >>> 0,
      0
    )
    return tones[hash % tones.length]
  }

  editUser(user: User | null = null): void {
    this.dialogs.open<void, UserEditorContext>(UserEditor, {
      context: {
        user,
        onSaved: () => {
          if (!this.destroyRef.destroyed) this.toast.success("Usuario guardado")
        }
      },
      showCloseButton: false,
      disableClose: true,
      autoFocus: "#user-name",
      restoreFocus: true,
      contentClass: "sm:max-w-lg max-h-[90dvh] overflow-y-auto"
    })
  }

  deleteUser(user: User): void {
    this.dialogs.open<void, DeleteUserContext>(DeleteUserDialog, {
      context: {
        user,
        onDeleted: () => {
          if (this.destroyRef.destroyed) return
          this.requestedPage.set(this.currentPage())
          this.toast.success(`Usuario ${user.name} eliminado`)
        }
      },
      showCloseButton: false,
      disableClose: true,
      autoFocus: "#cancel-delete-user",
      restoreFocus: "#new-user"
    })
  }

  logout(): void {
    this.auth.logout()
    void this.router.navigateByUrl("/login")
  }
}
