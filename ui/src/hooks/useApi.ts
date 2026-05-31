/**
 * API hook — wraps POST /api/do with the ATerm bearer token.
 *
 * The token comes from the backend-printed URL (`?token=...`) and is retained
 * for the current browser tab only.  API and WebSocket auth share this single
 * source so they cannot drift into different credentials.
 */

const TOKEN_STORAGE_KEY = "aterm.authToken";

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

function tokenFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token")?.trim();
  if (token) return token;

  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  const hashParams = new URLSearchParams(hash);
  return hashParams.get("token")?.trim() || null;
}

export function getAuthToken(): string | null {
  const urlToken = tokenFromUrl();
  if (urlToken) {
    try {
      window.sessionStorage.setItem(TOKEN_STORAGE_KEY, urlToken);
    } catch {
      // Session storage may be unavailable in hardened browsers; the URL token
      // still authenticates this page load.
    }
    return urlToken;
  }

  try {
    return window.sessionStorage.getItem(TOKEN_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function hasAuthToken(): boolean {
  return getAuthToken() !== null;
}

export interface ApiResult {
  ok: boolean;
  id?: string;
  marks?: Array<{ id: number; ref: string; type: "command" | "output" | "error" | "prompt"; text: string; lines: number }>;
  [key: string]: unknown;
}

export async function apiDo(body: Record<string, unknown>): Promise<ApiResult> {
  const token = getAuthToken();
  if (!token) {
    throw new ApiError(
      "Missing ATerm auth token. Open the tokenized URL printed by the ATerm server.",
      401,
      null,
    );
  }

  const resp = await fetch("/api/do", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  let payload: unknown = null;
  try {
    payload = await resp.json();
  } catch {
    // Preserve the transport status in the thrown ApiError below.
  }

  const data = payload as ApiResult | null;
  if (!resp.ok || data?.ok === false) {
    const apiMessage = typeof data?.error === "string" ? data.error : `ATerm API request failed (${resp.status})`;
    throw new ApiError(apiMessage, resp.status, payload);
  }

  return data ?? { ok: true };
}

export function wsUrl(sessionId: string): string | null {
  const token = getAuthToken();
  if (!token) return null;

  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/${encodeURIComponent(sessionId)}?token=${encodeURIComponent(token)}`;
}
