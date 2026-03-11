/**
 * /api/projects — manage user-defined project labels.
 *
 * GET    — list all projects with optional labels and stats
 * PATCH  — create or update a label for a project_ref
 * DELETE — remove a label (keeps project_ref in session_records)
 */

import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-helpers";
import { getD1Client } from "@/lib/d1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProjectRow {
  project_ref: string;
  label: string | null;
  sources: string;
  session_count: number;
  last_active: string;
}

interface Project {
  project_ref: string;
  label: string | null;
  sources: string[];
  session_count: number;
  last_active: string;
}

// ---------------------------------------------------------------------------
// GET — list all projects
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const authResult = await resolveUser(request);
  if (!authResult) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = authResult.userId;

  const sql = `
    SELECT
      sr.project_ref,
      pl.label,
      GROUP_CONCAT(DISTINCT sr.source) AS sources,
      COUNT(*) AS session_count,
      MAX(sr.last_message_at) AS last_active
    FROM session_records sr
    LEFT JOIN project_labels pl
      ON pl.user_id = sr.user_id AND pl.project_ref = sr.project_ref
    WHERE sr.user_id = ? AND sr.project_ref IS NOT NULL
    GROUP BY sr.project_ref
    ORDER BY last_active DESC
  `;

  const client = getD1Client();

  try {
    const result = await client.query<ProjectRow>(sql, [userId]);
    const projects: Project[] = result.results.map((row) => ({
      project_ref: row.project_ref,
      label: row.label,
      sources: row.sources ? row.sources.split(",") : [],
      session_count: row.session_count,
      last_active: row.last_active,
    }));

    return NextResponse.json({ projects });
  } catch (err) {
    console.error("Failed to query projects:", err);
    return NextResponse.json(
      { error: "Failed to query projects" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH — create or update a label
// ---------------------------------------------------------------------------

export async function PATCH(request: Request) {
  const authResult = await resolveUser(request);
  if (!authResult) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = authResult.userId;

  let body: { project_ref?: unknown; label?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { project_ref, label } = body;

  if (typeof project_ref !== "string" || !project_ref.trim()) {
    return NextResponse.json(
      { error: "project_ref is required" },
      { status: 400 },
    );
  }

  if (typeof label !== "string" || !label.trim()) {
    return NextResponse.json({ error: "label is required" }, { status: 400 });
  }

  if (label.length > 100) {
    return NextResponse.json(
      { error: "label must be 100 characters or less" },
      { status: 400 },
    );
  }

  const client = getD1Client();

  try {
    const sql = `
      INSERT INTO project_labels (user_id, project_ref, label, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT (user_id, project_ref) DO UPDATE SET
        label = excluded.label,
        updated_at = datetime('now')
    `;

    await client.execute(sql, [userId, project_ref, label.trim()]);

    const result = await client.firstOrNull<ProjectRow>(
      `
      SELECT
        sr.project_ref,
        pl.label,
        GROUP_CONCAT(DISTINCT sr.source) AS sources,
        COUNT(*) AS session_count,
        MAX(sr.last_message_at) AS last_active
      FROM session_records sr
      LEFT JOIN project_labels pl
        ON pl.user_id = sr.user_id AND pl.project_ref = sr.project_ref
      WHERE sr.user_id = ? AND sr.project_ref = ?
      GROUP BY sr.project_ref
      `,
      [userId, project_ref],
    );

    if (!result) {
      return NextResponse.json(
        { error: "Project not found in session records" },
        { status: 404 },
      );
    }

    const project: Project = {
      project_ref: result.project_ref,
      label: result.label,
      sources: result.sources ? result.sources.split(",") : [],
      session_count: result.session_count,
      last_active: result.last_active,
    };

    return NextResponse.json({ project });
  } catch (err) {
    console.error("Failed to update project label:", err);
    return NextResponse.json(
      { error: "Failed to update project label" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE — remove a label
// ---------------------------------------------------------------------------

export async function DELETE(request: Request) {
  const authResult = await resolveUser(request);
  if (!authResult) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = authResult.userId;

  const url = new URL(request.url);
  const project_ref = url.searchParams.get("project_ref");

  if (!project_ref) {
    return NextResponse.json(
      { error: "project_ref query param is required" },
      { status: 400 },
    );
  }

  const client = getD1Client();

  try {
    await client.execute(
      "DELETE FROM project_labels WHERE user_id = ? AND project_ref = ?",
      [userId, project_ref],
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to delete project label:", err);
    return NextResponse.json(
      { error: "Failed to delete project label" },
      { status: 500 },
    );
  }
}
