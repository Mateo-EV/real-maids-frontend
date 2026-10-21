import { InjectionToken } from "@angular/core"
import { User } from "@/app/features/users/domain/entities/user.entity"
import { UserError } from "@/app/features/users/domain/errors/user.error"
import { CreateUserParams } from "@/app/features/users/domain/params/create-user.params"
import { UpdateUserParams } from "@/app/features/users/domain/params/update-user.params"
import { Result } from "@/app/shared/utils/result"
import { Observable } from "rxjs"

import { UserListQuery } from "../models/user-list-query"
import { UserListPage } from "../models/user-list-page"

export interface UserRepository {
  getUsersPage(query: UserListQuery): Observable<Result<UserListPage, UserError>>
  createUser(params: CreateUserParams): Observable<Result<User, UserError>>
  getUserById(id: number): Observable<Result<User, UserError>>
  getUsers(): Observable<Result<User[], UserError>>
  deleteUserById(id: number): Observable<Result<void, UserError>>
  updateUserById(id: number, params: UpdateUserParams): Observable<Result<User, UserError>>
  updateUserStatusById(id: number, isActive: boolean): Observable<Result<User, UserError>>
}

export const USER_REPOSITORY = new InjectionToken<UserRepository>("user.repository")
