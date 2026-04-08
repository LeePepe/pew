/**
 * Auto season registration — registers teams with `auto_register_season = 1`
 * for a newly created season.
 *
 * Called from POST /api/admin/seasons after a season is created.
 * Skips teams that would cause a member conflict (user already
 * registered on another team for the same season).
 */

import type { DbRead, DbWrite } from "@/lib/db";

/**
 * Auto-register all eligible teams for a season.
 *
 * A team is eligible if:
 *   - `auto_register_season = 1`
 *   - Not already registered for this season
 *   - No member conflicts (each user can only be on one team per season)
 *
 * Returns the number of teams that were auto-registered.
 */
export async function autoRegisterTeamsForSeason(
  dbRead: DbRead,
  dbWrite: DbWrite,
  seasonId: string,
): Promise<number> {
  // Find teams with auto-registration enabled
  const { results: teams } = await dbRead.query<{
    id: string;
    created_by: string;
  }>(
    `SELECT t.id, t.created_by
     FROM teams t
     WHERE t.auto_register_season = 1
       AND t.id NOT IN (
         SELECT team_id FROM season_teams WHERE season_id = ?
       )`,
    [seasonId],
  );

  if (teams.length === 0) return 0;

  let registered = 0;

  for (const team of teams) {
    // Get current team members
    const { results: members } = await dbRead.query<{ user_id: string }>(
      "SELECT user_id FROM team_members WHERE team_id = ?",
      [team.id],
    );

    // Check for member conflicts — any member already registered for this season
    if (members.length > 0) {
      const placeholders = members.map(() => "?").join(",");
      const userIds = members.map((m) => m.user_id);
      const conflict = await dbRead.firstOrNull<{ user_id: string }>(
        `SELECT user_id FROM season_team_members
         WHERE season_id = ? AND user_id IN (${placeholders})
         LIMIT 1`,
        [seasonId, ...userIds],
      );
      if (conflict) {
        // Skip this team — a member is already on another team
        continue;
      }
    }

    // Find the owner to record as registered_by
    const owner = await dbRead.firstOrNull<{ user_id: string }>(
      "SELECT user_id FROM team_members WHERE team_id = ? AND role = 'owner' LIMIT 1",
      [team.id],
    );
    const registeredBy = owner?.user_id ?? team.created_by;

    // Register the team + freeze roster
    const regId = crypto.randomUUID();
    const memberIds = members.map(() => crypto.randomUUID());
    const statements: Array<{ sql: string; params: unknown[] }> = [
      {
        sql: `INSERT INTO season_teams (id, season_id, team_id, registered_by)
              VALUES (?, ?, ?, ?)`,
        params: [regId, seasonId, team.id, registeredBy],
      },
      ...members.map((m, i) => ({
        sql: `INSERT INTO season_team_members (id, season_id, team_id, user_id)
              VALUES (?, ?, ?, ?)`,
        params: [memberIds[i] as string, seasonId, team.id, m.user_id],
      })),
    ];

    try {
      await dbWrite.batch(statements);
      registered++;
    } catch (err) {
      // Compensate on failure — only delete rows created by THIS request (by UUID)
      // Using (season_id, team_id) would be wrong: a concurrent request may have
      // successfully registered the same team, and we'd delete their data.
      console.error(`Auto-registration failed for team ${team.id}:`, err);
      try {
        if (memberIds.length > 0) {
          const ph = memberIds.map(() => "?").join(",");
          await dbWrite.execute(
            `DELETE FROM season_team_members WHERE id IN (${ph})`,
            memberIds,
          );
        }
        await dbWrite.execute(
          "DELETE FROM season_teams WHERE id = ?",
          [regId],
        );
      } catch {
        // Swallow cleanup errors
      }
    }
  }

  return registered;
}
