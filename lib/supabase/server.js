import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Per-request Supabase client acting as the signed-in user (session cookies), so RLS decides what the
// caller can touch. Server routes and server components only; use .schema("campaign") for product tables.
export async function createRouteClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options);
        } catch {
          // Called from a context that can't set cookies; the session refresh happens on the next request.
        }
      },
    },
  });
}
