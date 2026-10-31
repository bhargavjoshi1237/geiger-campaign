"use client";

// Browser helper for this app's own route handlers. Prefixes the deployment base path (/campaign in
// production), sends JSON, and returns { ok, data, error, status } — it never throws, so screens branch
// on `ok` and own the toast, exactly like the data layer's return contract.

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

export async function apiFetch(path, { method = "GET", body, signal } = {}) {
  try {
    const res = await fetch(`${BASE_PATH}${path}`, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      signal,
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, data: null, error: data?.error || `Request failed (${res.status})`, status: res.status };
    }
    return { ok: true, data, error: null, status: res.status };
  } catch (error) {
    if (error?.name === "AbortError") return { ok: false, data: null, error: "aborted", status: 0 };
    console.error(`[api] ${method} ${path}`, error);
    return { ok: false, data: null, error: "Network error — try again.", status: 0 };
  }
}

export const apiGet = (path, opts) => apiFetch(path, { ...opts, method: "GET" });
export const apiPost = (path, body, opts) => apiFetch(path, { ...opts, method: "POST", body });
export const apiPatch = (path, body, opts) => apiFetch(path, { ...opts, method: "PATCH", body });
export const apiDelete = (path, opts) => apiFetch(path, { ...opts, method: "DELETE" });
