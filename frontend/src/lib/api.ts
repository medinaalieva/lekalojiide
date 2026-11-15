const API_BASE_URL =
  typeof window !== "undefined"
    ? "" // in browser, use Next.js rewrite /api/v1 -> backend
    : process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";

interface RequestOptions extends RequestInit {
  token?: string | null;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { token, headers = {}, ...rest } = options;

  let authToken = token;
  if (!authToken && typeof window !== "undefined") {
    authToken = localStorage.getItem("lekalo_token");
  }

  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${API_BASE_URL}${normalizedEndpoint}`;

  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers as Record<string, string>),
  };

  if (authToken) {
    requestHeaders["Authorization"] = `Bearer ${authToken}`;
  }

  const response = await fetch(url, {
    credentials: "include",
    ...rest,
    headers: requestHeaders,
  });

  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (err) {
    throw new ApiError(
      `Некорректный ответ сервера (${response.status})`,
      response.status
    );
  }

  if (!response.ok) {
    const errorMsg =
      json?.error?.message ||
      json?.message ||
      `Ошибка запроса (${response.status})`;
    const errorCode = json?.error?.code || json?.statusCode || "UNKNOWN_ERROR";
    const errorDetails = json?.error?.details || json?.details;
    throw new ApiError(errorMsg, response.status, errorCode, errorDetails);
  }

  return json;
}

// API methods
export const api = {
  get: <T = any>(endpoint: string, options?: RequestOptions) =>
    apiRequest<T>(endpoint, { ...options, method: "GET" }),

  post: <T = any>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T = any>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T = any>(endpoint: string, options?: RequestOptions) =>
    apiRequest<T>(endpoint, { ...options, method: "DELETE" }),
};
