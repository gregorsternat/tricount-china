export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function unauthorized(message = "Authentication required."): HttpError {
  return new HttpError(401, "UNAUTHORIZED", message);
}

export function forbidden(message = "You do not have access to this resource."): HttpError {
  return new HttpError(403, "FORBIDDEN", message);
}

export function notFound(message = "Resource not found."): HttpError {
  return new HttpError(404, "NOT_FOUND", message);
}

export function conflict(message: string): HttpError {
  return new HttpError(409, "CONFLICT", message);
}
