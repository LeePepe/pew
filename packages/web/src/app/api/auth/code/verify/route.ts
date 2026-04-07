/**
 * POST /api/auth/code/verify — Verify a one-time code and return API key.
 *
 * Called by CLI with `pew login --code XXXX-XXXX`.
 * Returns the user's api_key (generating one if needed) and email.
 *
 * No session required — the code itself is the authentication.
 */

import { NextResponse } from "next/server";
import { getDbRead, getDbWrite } from "@/lib/db";

interface AuthCodeRow {
  code: string;
  user_id: string;
  expires_at: string;
  used_at: string | null;
}

interface UserRow {
  id: string;
  email: string;
  api_key: string | null;
}

/** Generate a random API key: pk_ prefix + 32 hex chars */
function generateApiKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `pk_${hex}`;
}

export async function POST(request: Request) {
  // 1. Parse and validate request body
  let body: { code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const code = body.code?.trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  // Normalize: accept with or without hyphen
  const normalizedCode = code.includes("-") ? code : `${code.slice(0, 4)}-${code.slice(4)}`;

  const dbRead = await getDbRead();
  const dbWrite = await getDbWrite();

  try {
    // 2. Look up the code
    const authCode = await dbRead.firstOrNull<AuthCodeRow>(
      `SELECT code, user_id, expires_at, used_at FROM auth_codes WHERE code = ?`,
      [normalizedCode]
    );

    if (!authCode) {
      return NextResponse.json({ error: "Invalid code" }, { status: 401 });
    }

    // 3. Check if already used
    if (authCode.used_at) {
      return NextResponse.json({ error: "Code already used" }, { status: 401 });
    }

    // 4. Check expiry
    const now = new Date();
    const expiresAt = new Date(authCode.expires_at);
    if (now > expiresAt) {
      return NextResponse.json({ error: "Code expired" }, { status: 401 });
    }

    // 5. Mark code as used (atomic to prevent race conditions)
    const updateResult = await dbWrite.execute(
      `UPDATE auth_codes
       SET used_at = datetime('now')
       WHERE code = ? AND used_at IS NULL`,
      [normalizedCode]
    );

    // If no rows updated, someone else used it concurrently
    if (updateResult.changes === 0) {
      return NextResponse.json({ error: "Code already used" }, { status: 401 });
    }

    // 6. Get user info and api_key
    const user = await dbRead.firstOrNull<UserRow>(
      `SELECT id, email, api_key FROM users WHERE id = ?`,
      [authCode.user_id]
    );

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 500 });
    }

    let apiKey = user.api_key;

    // 7. Generate api_key if not exists
    if (!apiKey) {
      apiKey = generateApiKey();
      await dbWrite.execute(
        `UPDATE users SET api_key = ?, updated_at = datetime('now') WHERE id = ?`,
        [apiKey, user.id]
      );
    }

    return NextResponse.json({
      api_key: apiKey,
      email: user.email,
    });
  } catch (err) {
    console.error("Failed to verify auth code:", err);
    return NextResponse.json(
      { error: "Failed to verify code" },
      { status: 500 }
    );
  }
}
