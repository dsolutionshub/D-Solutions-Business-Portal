/**
 * Errors with an HTTP status and the API error shape: { error: { code, message, fields? } }.
 * Throw these from routes; errorHandler turns them into JSON.
 */
export class HttpError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 429,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, 'not_found', `${what} not found.`);
export const forbidden = (message = 'You do not have access to this.') =>
  new HttpError(403, 'forbidden', message);
export const conflict = (message: string, fields?: Record<string, string>) =>
  new HttpError(409, 'conflict', message, fields);
export const badRequest = (message: string, fields?: Record<string, string>) =>
  new HttpError(400, 'bad_request', message, fields);
