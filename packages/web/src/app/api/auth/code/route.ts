/**
 * POST /api/auth/code — Generate a one-time CLI authentication code.
 *
 * The code is 8 characters (XXXX-XXXX format), using a human-readable alphabet
 * that excludes ambiguous characters (0/O/I/L/1). Valid for 5 minutes.
 *
 * Requires session authentication (user must be logged in via browser).
 */

import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-helpers";
import { getDbWrite } from "@/lib/db";

// Human-readable alphabet: excludes 0/O/I/L/1 to avoid confusion
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8; // 4 + 4 with hyphen
const EXPIRY_MINUTES = 5;

/**
 * Generate a cryptographically random code in XXXX-XXXX format.
 */
function generateCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);

  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    if (i === 4) code += "-";
    const byte = bytes[i];
    if (byte !== undefined) {
      code += ALPHABET[byte % ALPHABET.length];
    }
  }
  return code;
}

export async function POST(request: Request) {
  // 1. Require session authentication
  const authResult = await resolveUser(request);
  if (!authResult) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = authResult.userId;
  const dbWrite = await getDbWrite();

  try {
    // 2. Invalidate any existing unused codes for this user
    await dbWrite.execute(
      `UPDATE auth_codes
       SET used_at = datetime('now')
       WHERE user_id = ? AND used_at IS NULL`,
      [userId]
    );

    // 3. Generate new code
    const code = generateCode();
    const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000).toISOString();

    // 4. Insert (retry on collision, extremely unlikely)
    let attempts = 0;
    while (attempts < 3) {
      try {
        await dbWrite.execute(
          `INSERT INTO auth_codes (code, user_id, expires_at)
           VALUES (?, ?, ?)`,
          [code, userId, expiresAt]
        );
        break;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("UNIQUE constraint") && attempts < 2) {
          attempts++;
          continue;
        }
        throw err;
      }
    }

    return NextResponse.json({
      code,
      expires_at: expiresAt,
    });
  } catch (err) {
    console.error("Failed to generate auth code:", err);
    return NextResponse.json(
      { error: "Failed to generate code" },
      { status: 500 }
    );
  }
}
