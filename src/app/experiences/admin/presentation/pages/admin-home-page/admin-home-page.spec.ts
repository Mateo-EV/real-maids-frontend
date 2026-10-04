import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { describe, it, expect, vi } from "vitest"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { AdminHomePage } from "./admin-home-page"

describe("AdminHomePage", () => {
  it("links the users demo while preserving identity and logout navigation", async () => {
    const auth = { session: signal({ name: "Demo", email: "demo@example.test" }), logout: vi.fn() }
    TestBed.configureTestingModule({ imports: [AdminHomePage], providers: [provideRouter([]), { provide: AuthStore, useValue: auth }] })
    const router = TestBed.inject(Router)
    const navigate = vi.spyOn(router, "navigateByUrl").mockResolvedValue(true)
    const fixture = TestBed.createComponent(AdminHomePage)
    fixture.detectChanges()
    const element = fixture.nativeElement as HTMLElement
    expect(element.querySelector('a[href="/admin/users"]')?.textContent).toBe("Administración de usuarios")
    expect(element.textContent).toContain("Bienvenido, Demo")
    fixture.componentInstance.logout()
    expect(auth.logout).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith("/login")
  })
})
