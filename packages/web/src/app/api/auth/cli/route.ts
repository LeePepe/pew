/**
 * GET /api/auth/cli — CLI login callback endpoint.
 *
 * Flow:
 * 1. CLI starts local HTTP server, opens browser to this URL with ?callback=...
 * 2. User is already signed in via Google OAuth (or redirected to /login first)
 * 3. This endpoint fetches/generates user's api_key
 * 4. Redirects back to CLI's local server with api_key + email in query params
 *
 * Security: callback URL must be localhost or 127.0.0.1.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getD1Client } from "@/lib/d1";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const callback = url.searchParams.get("callback");

  // 1. Check authentication
  const session = await auth();
  if (!session?.user?.id) {
    // Redirect to login page, preserving the return URL
    const returnUrl = url.pathname + url.search;
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${encodeURIComponent(returnUrl)}`, url.origin)
    );
  }

  // 2. Validate callback parameter
  if (!callback) {
    return NextResponse.json(
      { error: "Missing callback parameter" },
      { status: 400 }
    );
  }

  let callbackUrl: URL;
  try {
    callbackUrl = new URL(callback);
  } catch {
    return NextResponse.json(
      { error: "Invalid callback URL" },
      { status: 400 }
    );
  }

  // Security: only allow localhost callbacks
  if (
    callbackUrl.hostname !== "localhost" &&
    callbackUrl.hostname !== "127.0.0.1"
  ) {
    return NextResponse.json(
      { error: "callback must be a localhost URL" },
      { status: 400 }
    );
  }

  // 3. Get or generate api_key
  const client = getD1Client();
  const userId = session.user.id;
  const email = session.user.email ?? "";

  try {
    const row = await client.firstOrNull<{ api_key: string | null }>(
      "SELECT api_key FROM users WHERE id = ?",
      [userId]
    );

    let apiKey = row?.api_key;

    if (!apiKey) {
      // Generate a new api_key
      apiKey = generateApiKey();
      await client.execute(
        "UPDATE users SET api_key = ?, updated_at = datetime('now') WHERE id = ?",
        [apiKey, userId]
      );
    }

    // 4. Redirect back to CLI with api_key
    const redirectUrl = new URL(callbackUrl.toString());
    redirectUrl.searchParams.set("api_key", apiKey);
    redirectUrl.searchParams.set("email", email);

    return NextResponse.redirect(redirectUrl.toString());
  } catch (err) {
    console.error("CLI auth error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/** Generate a random API key: zk_ prefix + 32 hex chars */
function generateApiKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    ""
  );
  return `zk_${hex}`;
}
