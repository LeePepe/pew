/**
 * GET /api/teams/[teamId] — get team details.
 * DELETE /api/teams/[teamId] — leave team (or delete if owner and only member).
 */

import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-helpers";
import { getD1Client } from "@/lib/d1";

// ---------------------------------------------------------------------------
// GET — team details with members
// ---------------------------------------------------------------------------

export async function GET(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const authResult = await resolveUser(request);
  if (!authResult) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { teamId } = await params;
  const client = getD1Client();

  // Check membership
  const membership = await client.firstOrNull<{ role: string }>(
    "SELECT role FROM team_members WHERE team_id = ? AND user_id = ?",
    [teamId, authResult.userId],
  );

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  // Get team details
  const team = await client.firstOrNull<{
    id: string;
    name: string;
    slug: string;
    invite_code: string;
    created_at: string;
  }>(
    "SELECT id, name, slug, invite_code, created_at FROM teams WHERE id = ?",
    [teamId],
  );

  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  // Get members
  const members = await client.query<{
    user_id: string;
    name: string | null;
    nickname: string | null;
    image: string | null;
    role: string;
    joined_at: string;
  }>(
    `SELECT tm.user_id, u.name, u.nickname, u.image, tm.role, tm.joined_at
     FROM team_members tm
     JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = ?
     ORDER BY tm.joined_at ASC`,
    [teamId],
  );

  return NextResponse.json({
    ...team,
    role: membership.role,
    members: members.results.map((m) => ({
      userId: m.user_id,
      name: m.nickname ?? m.name,
      image: m.image,
      role: m.role,
      joinedAt: m.joined_at,
    })),
  });
}

// ---------------------------------------------------------------------------
// DELETE — leave team
// ---------------------------------------------------------------------------

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const authResult = await resolveUser(request);
  if (!authResult) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { teamId } = await params;
  const client = getD1Client();

  // Check membership
  const membership = await client.firstOrNull<{ role: string }>(
    "SELECT role FROM team_members WHERE team_id = ? AND user_id = ?",
    [teamId, authResult.userId],
  );

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  // Count remaining members
  const countRow = await client.firstOrNull<{ cnt: number }>(
    "SELECT COUNT(*) AS cnt FROM team_members WHERE team_id = ?",
    [teamId],
  );
  const memberCount = countRow?.cnt ?? 0;

  if (membership.role === "owner" && memberCount > 1) {
    return NextResponse.json(
      { error: "Transfer ownership before leaving (not yet supported — remove other members first)" },
      { status: 400 },
    );
  }

  // Remove membership
  await client.execute(
    "DELETE FROM team_members WHERE team_id = ? AND user_id = ?",
    [teamId, authResult.userId],
  );

  // If last member, delete the team
  if (memberCount <= 1) {
    await client.execute("DELETE FROM teams WHERE id = ?", [teamId]);
  }

  return NextResponse.json({ ok: true });
}
