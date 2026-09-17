export type Result<T = unknown, E = Error> = Success<T> | Failure<E>;

export interface ResultBase<T, E> {
  readonly success: boolean;

  either<R>(onSuccess: (data: T) => R, onFailure: (error: E) => R): R;

  map<R>(fn: (data: T) => R): Result<R, E>;

  mapError<F>(fn: (error: E) => F): Result<T, F>;

  getOrElse(defaultValue: T): T;
}

export class Success<T> implements ResultBase<T, never> {
  readonly success = true as const;

  constructor(public readonly data: T) {}

  either<R>(onSuccess: (data: T) => R, _onFailure: (error: never) => R): R {
    return onSuccess(this.data);
  }

  map<R>(fn: (data: T) => R): Success<R> {
    return Result.success(fn(this.data));
  }

  mapError<F>(_fn: (error: never) => F): Success<T> {
    return Result.success(this.data);
  }

  getOrElse(_defaultValue: T): T {
    return this.data;
  }
}

export class Failure<E> implements ResultBase<never, E> {
  readonly success = false as const;

  constructor(public readonly error: E) {}

  either<R>(_onSuccess: (data: never) => R, onFailure: (error: E) => R): R {
    return onFailure(this.error);
  }

  map<R>(_fn: (data: never) => R): Failure<E> {
    return Result.failure(this.error);
  }

  mapError<F>(fn: (error: E) => F): Failure<F> {
    return Result.failure(fn(this.error));
  }

  getOrElse(_defaultValue: never): never {
    return _defaultValue;
  }
}

export const Result = {
  success<T>(data: T): Success<T> {
    return new Success(data);
  },

  failure<E>(error: E): Failure<E> {
    return new Failure(error);
  },
};
