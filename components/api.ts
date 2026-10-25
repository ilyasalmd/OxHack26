/** A failed request, with the HTTP status so callers can tell "signed out" from "no signal". */
export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function api<T = any>(url: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<T> {
  const r = await fetch(url, {
    signal: init?.signal,
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const isJson = r.headers.get("content-type")?.includes("json");
  const data = isJson ? await r.json() : await r.blob();
  if (!r.ok) throw new ApiError((data as any)?.error ?? `Request failed (${r.status})`, r.status);
  return data as T;
}
