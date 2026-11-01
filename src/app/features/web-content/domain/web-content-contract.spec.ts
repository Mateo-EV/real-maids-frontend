import { Injector } from "@angular/core"
import { firstValueFrom, Observable, of } from "rxjs"
import { describe, expect, expectTypeOf, it } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { LandingSection } from "./entities/landing-section.entity"
import { WebContentError } from "./errors/web-content.error"
import {
  CreateLandingContentParams,
  SubmitWebFormParams,
  UpdateLandingContentParams
} from "./params/web-content.params"
import { WEB_CONTENT_REPOSITORY, WebContentRepository } from "./repositories/web-content.repository"

describe("web content domain boundary", () => {
  it("resolves a substitutable repository and transports success and typed failures for all operations", async () => {
    const error = new WebContentError("FORBIDDEN")
    const failure = () => of(Result.failure(error))
    const section = LandingSection.create(1, "hero", "Hero", 1, true)
    const repository: WebContentRepository = {
      getSections: () => of(Result.success([section])),
      createSection: failure,
      updateSection: failure,
      getSectionContents: failure,
      createSectionContent: failure,
      updateSectionContent: failure,
      submitWebForm: failure,
      getWebForms: failure,
      processWebForm: failure
    }
    const injector = Injector.create({
      providers: [{ provide: WEB_CONTENT_REPOSITORY, useValue: repository }]
    })
    const resolved = injector.get(WEB_CONTENT_REPOSITORY)
    expect(resolved).toBe(repository)
    expect(await firstValueFrom(resolved.getSections())).toEqual(Result.success([section]))
    const sectionParams = { key: "hero", name: "Hero", order: 1, isVisible: true }
    const content: CreateLandingContentParams = {
      language: "es",
      title: null,
      body: null,
      imageUrl: null,
      isPublished: false
    }
    const submission: SubmitWebFormParams = {
      name: "Visitor",
      email: null,
      phone: null,
      message: null
    }
    const operations: Observable<unknown>[] = [
      resolved.createSection(sectionParams),
      resolved.updateSection(1, { isVisible: false }),
      resolved.getSectionContents(1),
      resolved.createSectionContent(1, content),
      resolved.updateSectionContent(1, 2, { title: null }),
      resolved.submitWebForm(submission),
      resolved.getWebForms({ offset: 0, limit: 10, isProcessed: false }),
      resolved.processWebForm(3, { prospectId: null, isProcessed: true })
    ]
    for (const operation of operations) {
      expect(await firstValueFrom(operation)).toEqual(Result.failure(error))
    }
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe("WebContentError")
    expect(error.code).toBe("FORBIDDEN")
    expect(error.message).toBe("Web content operation failed")
  })

  it("distinguishes omitted patches from explicit SQL null without accepting generated metadata", () => {
    expectTypeOf<UpdateLandingContentParams["title"]>().toEqualTypeOf<string | null | undefined>()
    expectTypeOf<
      Extract<keyof CreateLandingContentParams, "id" | "updatedAt" | "registeredByUserId">
    >().toEqualTypeOf<never>()
    expectTypeOf<
      Extract<
        keyof SubmitWebFormParams,
        "id" | "originIp" | "submittedAt" | "isProcessed" | "prospectId"
      >
    >().toEqualTypeOf<never>()
    expect(new WebContentError("CONFLICT", "Safe conflict").message).toBe("Safe conflict")
  })
})
