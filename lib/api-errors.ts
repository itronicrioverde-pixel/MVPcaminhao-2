export const SESSION_EXPIRED_MESSAGE = "Sua sessão expirou ou esta conta não possui acesso. Entre novamente.";

export const errorCodes = {
  SESSION_EXPIRED: "SESSION_EXPIRED",
  INVALID_ORIGIN: "INVALID_ORIGIN",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  INVALID_TYPE: "INVALID_TYPE",
  INVALID_DATA: "INVALID_DATA",
  CONFIRMATION_REQUIRED: "CONFIRMATION_REQUIRED",
  UNPROCESSABLE: "UNPROCESSABLE",
  INVALID_CITY: "INVALID_CITY",
  SAME_CITY: "SAME_CITY",
  NO_ROUTE: "NO_ROUTE",
  RATE_LIMITED: "RATE_LIMITED",
  UPSTREAM_UNAVAILABLE: "UPSTREAM_UNAVAILABLE",
  TIMEOUT: "TIMEOUT",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ApiCode = (typeof errorCodes)[keyof typeof errorCodes];

export function defaultCodeForStatus(status: number): ApiCode {
  switch (status) {
    case 400: return errorCodes.INVALID_DATA;
    case 401: return errorCodes.SESSION_EXPIRED;
    case 403: return errorCodes.FORBIDDEN;
    case 404: return errorCodes.NOT_FOUND;
    case 409: return errorCodes.CONFLICT;
    case 413: return errorCodes.PAYLOAD_TOO_LARGE;
    case 422: return errorCodes.UNPROCESSABLE;
    case 429: return errorCodes.RATE_LIMITED;
    case 502: return errorCodes.UPSTREAM_UNAVAILABLE;
    case 504: return errorCodes.TIMEOUT;
    default: return errorCodes.INTERNAL_ERROR;
  }
}

export function apiError(status: number, message: string, code: ApiCode = defaultCodeForStatus(status), init: ResponseInit = {}): Response {
  return Response.json({ error: message, code }, { status, ...init });
}