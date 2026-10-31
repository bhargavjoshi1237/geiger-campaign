import { NextResponse } from "next/server";

// Shared route-handler plumbing: a typed error, JSON responses and a wrapper that turns any thrown
// ApiError into its status and anything else into a logged 500. Routes stay thin around a lib/ module.

export class ApiError extends Error {
  constructor(status, message, code = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message) => new ApiError(400, message, "invalid_input");
export const unauthorized = (message = "Sign in to continue.") => new ApiError(401, message, "unauthenticated");
export const forbidden = (message = "Your role doesn't allow this.") => new ApiError(403, message, "forbidden");
export const notFound = (message = "Not found.") => new ApiError(404, message, "not_found");
export const notConfigured = (message) => new ApiError(503, message, "not_configured");

export function json(data, status = 200, headers = {}) {
  return NextResponse.json(data, { status, headers });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw badRequest("Invalid JSON body.");
  }
}

export async function handle(label, fn) {
  try {
    const result = await fn();
    return result instanceof Response ? result : json(result ?? { ok: true });
  } catch (error) {
    if (error instanceof ApiError) {
      return json({ error: error.message, code: error.code }, error.status);
    }
    console.error(`[api.${label}]`, error);
    return json({ error: "Something went wrong.", code: "internal" }, 500);
  }
}
