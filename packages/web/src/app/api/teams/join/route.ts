/**
 * POST /api/teams/join — join a team by invite code.
 */

import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-helpers";
import { getD1Client } from "@/lib/d1";

export async function POST(request: Request) {
  const authResult = await resolveUser(request);
  if (!authResult) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const inviteCode = body.invite_code;
  if (typeof inviteCode !== "string" || inviteCode.length === 0) {
    return NextResponse.json(
      { error: "invite_code is required" },
      { status: 400 },
    );
  }

  const client = getD1Client();

  // Find team by invite code
  const team = await client.firstOrNull<{ id: string; name: string; slug: string }>(
    "SELECT id, name, slug FROM teams WHERE invite_code = ?",
    [inviteCode],
  );

  if (!team) {
    return NextResponse.json(
      { error: "Invalid invite code" },
      { status: 404 },
    );
  }

  // Check if already a member
  const existing = await client.firstOrNull<{ id: string }>(
    "SELECT id FROM team_members WHERE team_id = ? AND user_id = ?",
    [team.id, authResult.userId],
  );

  if (existing) {
    return NextResponse.json(
      { error: "Already a member of this team" },
      { status: 409 },
    );
  }

  // Add as member
  await client.execute(
    `INSERT INTO team_members (id, team_id, user_id, role, joined_at)
     VALUES (?, ?, ?, 'member', datetime('now'))`,
    [crypto.randomUUID(), team.id, authResult.userId],
  );

  return NextResponse.json({
    team_id: team.id,
    team_name: team.name,
    team_slug: team.slug,
  });
}
