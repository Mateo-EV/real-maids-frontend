import { DatePipe, isPlatformBrowser, NgTemplateOutlet } from "@angular/common"
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  effect,
  untracked,
  OnInit,
  PLATFORM_ID,
  signal
} from "@angular/core"
import { NgIcon, provideIcons } from "@ng-icons/core"
import {
  lucideUsers,
  lucideSmartphone,
  lucideShield,
  lucideClipboardList,
  lucidePlus,
  lucidePencil,
  lucidePower,
  lucideTrash2,
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
import { User } from "../../../domain/entities/user.entity"
import { UserStore } from "../../state/user.store"
import { RolesStore } from "../../state/roles.store"
import { UserListStore } from "../../state/user-list.store"
import { UserListQuery } from "../../../domain/models/user-list-query"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { defer, finalize, forkJoin, interval, of, Subject, switchMap } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { demoDecoration, initials } from "../../demo/users-demo.fixture"
import { UserEditor, UserEditorContext } from "../../components/user-editor/user-editor"
import {
  DeleteUserContext,
  DeleteUserDialog
} from "../../components/delete-user-dialog/delete-user-dialog"
import { HlmInputGroupImports } from "@spartan-ng/helm/input-group"
import { HotToastService } from "@ngxpert/hot-toast"
import { TablePagination } from "@/app/shared/components/table-pagination/table-pagination"
import {
  UserStatusContext,
  UserStatusDialog
} from "../../components/user-status-dialog/user-status-dialog"

import { UserSessionsStore } from "../../state/user-sessions.store"
import { UserSessions } from "../../components/user-sessions/user-sessions"
import { RbacMatrix } from "../../components/rbac-matrix/rbac-matrix"
import { AuditViewer } from "../../components/audit-viewer/audit-viewer"
import { AuditLogsStore } from "../../state/audit-logs.store"

@Component({
  selector: "app-users-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    NgTemplateOutlet,
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
    TablePagination,
    UserSessions,
    RbacMatrix,
    AuditViewer
  ],
  providers: [
    UserListStore,
    provideIcons({
      lucideUsers,
      lucideSmartphone,
      lucideShield,
      lucideClipboardList,
      lucidePlus,
      lucidePencil,
      lucidePower,
      lucideTrash2,
      lucideSearch
    })
  ],
  templateUrl: "./users-page.html",
  styleUrl: "./users-page.css"
})
export class UsersPage implements OnInit {
  readonly users = inject(UserStore)
  readonly list = inject(UserListStore)
  readonly roles = inject(RolesStore)
  readonly sessions = inject(UserSessionsStore)
  private readonly platformId = inject(PLATFORM_ID)
  readonly section = signal<"users" | "sessions" | "rbac" | "audit">("users")
  readonly sessionCount = computed(() => this.sessions.sessionCount())
  readonly sessionActiveCount = computed(() => this.sessions.activeSessions().length)
  private readonly destroyRef = inject(DestroyRef)
  private readonly dialogs = inject(HlmDialogService)
  private readonly toast = inject(HotToastService)
  readonly audit = inject(AuditLogsStore)
  readonly initials = initials
  readonly decoration = demoDecoration
  readonly initializing = signal(false)
  readonly loadError = signal(false)
  readonly search = signal("")
  readonly roleFilter = signal("")
  readonly statusFilter = signal("all")
  readonly pageSize = 10
  readonly activeCount = computed(() => this.users.users().filter(user => user.isActive).length)
  readonly pageCount = computed(() => {
    const result = this.list.result()
    return Math.max(1, result ? Math.ceil(result.total / result.limit) : 0)
  })
  readonly currentPage = computed(() => {
    const query = this.list.query()
    return (query.offset ?? 0) / (query.limit ?? this.pageSize) + 1
  })
  readonly visibleUsers = computed(() =>
    this.list.loaded() ? (this.list.result()?.items ?? []) : []
  )
  readonly rangeStart = computed(() => {
    const page = this.list.result()
    return this.visibleUsers().length && page ? page.offset + 1 : 0
  })
  readonly rangeEnd = computed(() =>
    this.visibleUsers().length ? this.rangeStart() + this.visibleUsers().length - 1 : 0
  )
  private readonly queries = new Subject<void>()
  private readonly listQueries = new Subject<{ query: UserListQuery; delay: number }>()
  private mutationRevision = this.users.mutationRevision()

  constructor() {
    effect(() => {
      const revision = this.users.mutationRevision()
      if (revision === this.mutationRevision) return
      this.mutationRevision = revision
      untracked(() => this.retryList())
    })
  }

  private loadList(query: UserListQuery, delay = 0): void {
    if (!this.destroyRef.destroyed) this.listQueries.next({ query, delay })
  }

  retryList(): void {
    this.loadList(this.list.query())
  }

  private applyFilters(delay = 0): void {
    const search = this.search().trim(),
      role = this.roleFilter(),
      status = this.statusFilter()
    this.loadList(
      {
        offset: 0,
        limit: this.pageSize,
        ...(search ? { search } : {}),
        ...(role !== "" ? { roleId: Number(role) } : {}),
        ...(status !== "all" ? { isActive: status === "active" } : {})
      },
      delay
    )
  }

  private reload(): void {
    if (!this.destroyRef.destroyed) this.queries.next()
  }

  ngOnInit(): void {
    this.listQueries
      .pipe(
        switchMap(({ query, delay }) => this.list.load(query, delay)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
    this.retryList()
    this.queries
      .pipe(
        switchMap(() =>
          defer(() => {
            this.initializing.set(true)
            this.loadError.set(false)
            return forkJoin({
              roles: this.roles.loaded()
                ? of(Result.success(this.roles.roles()))
                : this.roles.loadRoles(),
              users: this.users.loadUsers()
            }).pipe(
              finalize(() => {
                if (!this.destroyRef.destroyed) this.initializing.set(false)
              })
            )
          })
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(result => {
        if (this.destroyRef.destroyed) return
        this.loadError.set(!result.roles.success || !result.users.success)
      })
    this.retry()
    this.retrySessions()
    this.audit.loadGlobalTotal().pipe(takeUntilDestroyed(this.destroyRef)).subscribe()
    if (isPlatformBrowser(this.platformId)) {
      interval(1000)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.sessions.refreshClock())
    }
  }

  retrySessions(): void {
    if (this.destroyRef.destroyed || this.sessions.loading()) return
    this.sessions.loadAllSessions().pipe(takeUntilDestroyed(this.destroyRef)).subscribe()
  }

  retry(): void {
    if (this.destroyRef.destroyed || this.initializing()) return
    this.reload()
  }

  setSearch(value: string): void {
    this.search.set(value)
    this.applyFilters(250)
  }
  setRoleFilter(value: string | null | undefined): void {
    this.roleFilter.set(value ?? "")
    this.applyFilters()
  }
  setStatusFilter(value: string | null | undefined): void {
    this.statusFilter.set(value ?? "all")
    this.applyFilters()
  }
  clearFilters(): void {
    this.search.set("")
    this.roleFilter.set("")
    this.statusFilter.set("all")
    this.applyFilters()
  }
  goToPage(page: number): void {
    const selected = Math.max(1, Math.min(page, this.pageCount()))
    if (selected !== this.currentPage()) {
      const query = this.list.query()
      this.loadList({ ...query, offset: (selected - 1) * (query.limit ?? this.pageSize) })
    }
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
          this.toast.success(`Usuario ${user.name} eliminado`)
        }
      },
      showCloseButton: false,
      disableClose: true,
      autoFocus: "#cancel-delete-user",
      restoreFocus: "#new-user"
    })
  }

  changeUserStatus(user: User): void {
    if (this.destroyRef.destroyed) return
    const status = user.isActive ? "desactivado" : "activado"
    this.dialogs.open<void, UserStatusContext>(UserStatusDialog, {
      context: {
        user,
        onChanged: () => {
          if (this.destroyRef.destroyed) return
          this.toast.success(`Usuario ${user.name} ${status}`)
        }
      },
      showCloseButton: false,
      disableClose: true,
      autoFocus: "#cancel-status-user",
      restoreFocus: "#new-user"
    })
  }
}
