import { SESSION_EXPIRED_MESSAGE } from "@/lib/api-errors";

const DEFAULT_TIMEOUT_MS = 20000;
const NO_CONNECTION_MESSAGE = "Sem conexão com o servidor. Verifique sua internet e tente novamente.";
const TIMEOUT_MESSAGE = "A requisição demorou demais. Aguarde um instante e tente novamente.";
export const UNEXPECTED_RESPONSE_MESSAGE = "O servidor retornou uma resposta inesperada. Recarregue a página e tente novamente.";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type RequestOptions = {
  method?: HttpMethod;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
};

type ErrorPayload = { error?: unknown; code?: unknown };

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function isApiCode(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function messageForStatus(status: number): string {
  switch (status) {
    case 401: return SESSION_EXPIRED_MESSAGE;
    case 403: return "Você não tem permissão para realizar esta ação.";
    case 404: return "Registro não encontrado. Ele pode ter sido removido.";
    case 409: return "Os dados foram alterados por outra pessoa. Recarregue a página e tente novamente.";
    case 413: return "O arquivo enviado é muito grande.";
    case 422: return "Confira os dados informados.";
    case 429: return "Muitas tentativas em pouco tempo. Aguarde um instante e tente novamente.";
    case 500: return "Erro interno no servidor. Tente novamente em instantes.";
    case 502: return "Serviço temporariamente indisponível. Tente novamente em instantes.";
    case 504: return "O servidor demorou para responder. Tente novamente.";
    default: return "Não foi possível concluir a operação. Tente novamente.";
  }
}

function defaultCodeForStatus(status: number): string {
  switch (status) {
    case 401: return "SESSION_EXPIRED";
    case 403: return "FORBIDDEN";
    case 404: return "NOT_FOUND";
    case 409: return "CONFLICT";
    case 413: return "PAYLOAD_TOO_LARGE";
    case 422: return "INVALID_DATA";
    case 429: return "RATE_LIMITED";
    case 500: return "INTERNAL_ERROR";
    case 502: return "UPSTREAM_UNAVAILABLE";
    case 504: return "TIMEOUT";
    default: return "HTTP_ERROR";
  }
}

function findError(data: unknown): { message: string; code?: string } | null {
  if (typeof data !== "object" || data === null) return null;
  const payload = data as ErrorPayload;
  if (typeof payload.error === "string" && payload.error.length > 0) {
    return { message: payload.error, code: isApiCode(payload.code) ? payload.code : undefined };
  }
  return null;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const status = response.status;
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("json");
  const text = await response.text().catch(() => "");
  const emptyBody = text.trim() === "";
  let data: unknown = undefined;
  if (!emptyBody && isJson) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
  } else if (!emptyBody) {
    data = text;
  }
  if (response.ok) {
    if (!emptyBody && (!isJson || data === undefined)) {
      throw new ApiError(0, UNEXPECTED_RESPONSE_MESSAGE, "INVALID_RESPONSE");
    }
    return data as T;
  }
  const found = findError(data);
  const message = status === 401 ? SESSION_EXPIRED_MESSAGE : found?.message ?? messageForStatus(status);
  const code = status === 401 ? "SESSION_EXPIRED" : found?.code ?? defaultCodeForStatus(status);
  throw new ApiError(status, message, code);
}

function makeAbortError(reason?: unknown): DOMException {
  if (reason instanceof DOMException) return reason;
  return new DOMException("This operation was aborted", "AbortError");
}

export async function http<T = unknown>(url: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const onSignal = () => controller.abort(options.signal?.reason);
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (timeoutMs > 0) {
    timer = setTimeout(() => controller.abort(new DOMException("The request timed out", "TimeoutError")), timeoutMs);
  }
  if (options.signal) {
    if (options.signal.aborted) throw makeAbortError(options.signal.reason);
    options.signal.addEventListener("abort", onSignal, { once: true });
  }
  try {
    const response = await fetch(url, {
      method,
      headers: {
        ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(method === "GET" ? { "cache-control": "no-store" } : {}),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
      cache: method === "GET" ? "no-store" : "default",
    });
    return await parseResponse<T>(response);
  } catch (error) {
    if (options.signal?.aborted) throw makeAbortError(options.signal.reason);
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new ApiError(0, TIMEOUT_MESSAGE, "TIMEOUT");
    }
    throw new ApiError(0, NO_CONNECTION_MESSAGE, "NETWORK_ERROR");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (options.signal) options.signal.removeEventListener("abort", onSignal);
  }
}

export const httpApi = {
  get<T = unknown>(url: string, options: Omit<RequestOptions, "method"> = {}): Promise<T> {
    return http<T>(url, { ...options, method: "GET" });
  },
  post<T = unknown>(url: string, body?: unknown, options: Omit<RequestOptions, "method" | "body"> = {}): Promise<T> {
    return http<T>(url, { ...options, method: "POST", body });
  },
  put<T = unknown>(url: string, body?: unknown, options: Omit<RequestOptions, "method" | "body"> = {}): Promise<T> {
    return http<T>(url, { ...options, method: "PUT", body });
  },
  del<T = unknown>(url: string, options: Omit<RequestOptions, "method"> = {}): Promise<T> {
    return http<T>(url, { ...options, method: "DELETE" });
  },
};