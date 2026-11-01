import { InjectionToken } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { LandingSection } from "../entities/landing-section.entity"
import { LandingContent } from "../entities/landing-content.entity"
import { WebForm } from "../entities/web-form.entity"
import { WebContentError } from "../errors/web-content.error"
import {
  CreateLandingSectionParams,
  UpdateLandingSectionParams,
  CreateLandingContentParams,
  UpdateLandingContentParams,
  SubmitWebFormParams,
  ProcessWebFormParams,
  WebFormQuery
} from "../params/web-content.params"

/** Proposed domain contracts only; no web-content API has been confirmed. */
export interface WebContentRepository {
  getSections(): Observable<Result<LandingSection[], WebContentError>>
  createSection(
    params: CreateLandingSectionParams
  ): Observable<Result<LandingSection, WebContentError>>
  updateSection(
    id: number,
    params: UpdateLandingSectionParams
  ): Observable<Result<LandingSection, WebContentError>>
  getSectionContents(sectionId: number): Observable<Result<LandingContent[], WebContentError>>
  createSectionContent(
    sectionId: number,
    params: CreateLandingContentParams
  ): Observable<Result<LandingContent, WebContentError>>
  updateSectionContent(
    sectionId: number,
    contentId: number,
    params: UpdateLandingContentParams
  ): Observable<Result<LandingContent, WebContentError>>
  submitWebForm(params: SubmitWebFormParams): Observable<Result<WebForm, WebContentError>>
  getWebForms(query: WebFormQuery): Observable<Result<PaginationResponse<WebForm>, WebContentError>>
  processWebForm(
    id: number,
    params: ProcessWebFormParams
  ): Observable<Result<WebForm, WebContentError>>
}

export const WEB_CONTENT_REPOSITORY = new InjectionToken<WebContentRepository>(
  "web-content.repository"
)
