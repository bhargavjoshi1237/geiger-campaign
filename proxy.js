import { NextResponse } from "next/server";

// Public ingest (/api/public/*) and the developer API (/api/v1/*) are called cross-origin from customer
// sites and servers, so they answer preflights and send CORS headers. They never rely on cookies:
// public routes take a public key or record id, v1 routes take a secret API key.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, x-api-key, x-geiger-key",
  "Access-Control-Max-Age": "86400",
};

export default function proxy(request) {
  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }
  const response = NextResponse.next();
  for (const [key, value] of Object.entries(CORS_HEADERS)) response.headers.set(key, value);
  return response;
}

// Both variants: dev has no basePath, prod serves under /campaign.
export const config = {
  matcher: ["/api/public/:path*", "/api/v1/:path*", "/campaign/api/public/:path*", "/campaign/api/v1/:path*"],
};
