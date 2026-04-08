import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDbRead, createMockDbWrite } from "./test-utils";

// ---------------------------------------------------------------------------
// Tests for autoRegisterTeamsForSeason
// ---------------------------------------------------------------------------

vi.mock("@/lib/db", () => ({
  getDbRead: vi.fn(),
  getDbWrite: vi.fn(),
}));

import { autoRegisterTeamsForSeason } from "@/lib/auto-register";

describe("autoRegisterTeamsForSeason", () => {
  let mockDbRead: ReturnType<typeof createMockDbRead>;
  let mockDbWrite: ReturnType<typeof createMockDbWrite>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDbRead = createMockDbRead();
    mockDbWrite = createMockDbWrite();
  });

  it("should return 0 when no teams have auto-registration enabled", async () => {
    mockDbRead.query.mockResolvedValueOnce({ results: [] }); // no eligible teams

    const count = await autoRegisterTeamsForSeason(mockDbRead, mockDbWrite, "season-1");

    expect(count).toBe(0);
    expect(mockDbWrite.batch).not.toHaveBeenCalled();
  });

  it("should auto-register a team with no member conflicts", async () => {
    mockDbRead.query
      .mockResolvedValueOnce({
        // eligible teams
        results: [{ id: "team-1", created_by: "owner-1" }],
      })
      .mockResolvedValueOnce({
        // team members
        results: [{ user_id: "u1" }, { user_id: "u2" }],
      });
    // No member conflicts
    mockDbRead.firstOrNull
      .mockResolvedValueOnce(null) // no conflict
      .mockResolvedValueOnce({ user_id: "owner-1" }); // owner lookup
    mockDbWrite.batch.mockResolvedValueOnce([]);

    const count = await autoRegisterTeamsForSeason(mockDbRead, mockDbWrite, "season-1");

    expect(count).toBe(1);
    expect(mockDbWrite.batch).toHaveBeenCalledTimes(1);
    // Should have 1 season_teams INSERT + 2 season_team_members INSERTs
    const batchStatements = mockDbWrite.batch.mock.calls[0]![0] as Array<{ sql: string; params: unknown[] }>;
    expect(batchStatements).toHaveLength(3);
    expect(batchStatements[0]!.sql).toContain("INSERT INTO season_teams");
    expect(batchStatements[1]!.sql).toContain("INSERT INTO season_team_members");
    expect(batchStatements[2]!.sql).toContain("INSERT INTO season_team_members");
  });

  it("should skip team when a member has a conflict", async () => {
    mockDbRead.query
      .mockResolvedValueOnce({
        results: [{ id: "team-1", created_by: "owner-1" }],
      })
      .mockResolvedValueOnce({
        results: [{ user_id: "u1" }],
      });
    // Member conflict found
    mockDbRead.firstOrNull.mockResolvedValueOnce({ user_id: "u1" });

    const count = await autoRegisterTeamsForSeason(mockDbRead, mockDbWrite, "season-1");

    expect(count).toBe(0);
    expect(mockDbWrite.batch).not.toHaveBeenCalled();
  });

  it("should register multiple teams and skip conflicting ones", async () => {
    mockDbRead.query
      .mockResolvedValueOnce({
        // 2 eligible teams
        results: [
          { id: "team-1", created_by: "owner-1" },
          { id: "team-2", created_by: "owner-2" },
        ],
      })
      // team-1 members
      .mockResolvedValueOnce({ results: [{ user_id: "u1" }] })
      // team-2 members
      .mockResolvedValueOnce({ results: [{ user_id: "u2" }] });

    mockDbRead.firstOrNull
      // team-1: conflict found — skip
      .mockResolvedValueOnce({ user_id: "u1" })
      // team-2: no conflict
      .mockResolvedValueOnce(null)
      // team-2 owner lookup
      .mockResolvedValueOnce({ user_id: "owner-2" });

    mockDbWrite.batch.mockResolvedValueOnce([]);

    const count = await autoRegisterTeamsForSeason(mockDbRead, mockDbWrite, "season-1");

    expect(count).toBe(1);
    expect(mockDbWrite.batch).toHaveBeenCalledTimes(1);
  });

  it("should handle team with no members gracefully", async () => {
    mockDbRead.query
      .mockResolvedValueOnce({
        results: [{ id: "team-empty", created_by: "owner-1" }],
      })
      .mockResolvedValueOnce({ results: [] }); // no members

    // No conflict check needed (0 members), owner lookup
    mockDbRead.firstOrNull.mockResolvedValueOnce({ user_id: "owner-1" });
    mockDbWrite.batch.mockResolvedValueOnce([]);

    const count = await autoRegisterTeamsForSeason(mockDbRead, mockDbWrite, "season-1");

    expect(count).toBe(1);
    // Only 1 statement: season_teams INSERT (no member rows)
    const batchStatements = mockDbWrite.batch.mock.calls[0]![0] as Array<{ sql: string; params: unknown[] }>;
    expect(batchStatements).toHaveLength(1);
    expect(batchStatements[0]!.sql).toContain("INSERT INTO season_teams");
  });

  it("should compensate on batch failure using generated UUIDs only", async () => {
    mockDbRead.query
      .mockResolvedValueOnce({
        results: [{ id: "team-1", created_by: "owner-1" }],
      })
      .mockResolvedValueOnce({ results: [{ user_id: "u1" }] });

    mockDbRead.firstOrNull
      .mockResolvedValueOnce(null) // no conflict
      .mockResolvedValueOnce({ user_id: "owner-1" }); // owner

    mockDbWrite.batch.mockRejectedValueOnce(new Error("D1 batch failed"));
    mockDbWrite.execute.mockResolvedValue({ changes: 1, duration: 0.01 });

    const count = await autoRegisterTeamsForSeason(mockDbRead, mockDbWrite, "season-1");

    expect(count).toBe(0);
    // Compensation must use THIS request's generated UUIDs only — not (season_id, team_id)
    // Using (season_id, team_id) would delete data from a concurrent successful request
    expect(mockDbWrite.execute).toHaveBeenCalledTimes(2);
    // First call: DELETE season_team_members by member IDs (1 member = 1 UUID)
    expect(mockDbWrite.execute.mock.calls[0]![0]).toContain("DELETE FROM season_team_members WHERE id IN");
    expect(mockDbWrite.execute.mock.calls[0]![1]).toHaveLength(1); // 1 member UUID
    // Second call: DELETE season_teams by regId
    expect(mockDbWrite.execute.mock.calls[1]![0]).toContain("DELETE FROM season_teams WHERE id = ?");
    expect(mockDbWrite.execute.mock.calls[1]![1]).toHaveLength(1); // 1 regId UUID
  });
});
