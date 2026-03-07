import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/leaderboard/route";
import * as d1Module from "@/lib/d1";

// Mock D1
vi.mock("@/lib/d1", async (importOriginal) => {
  const original = await importOriginal<typeof d1Module>();
  return {
    ...original,
    getD1Client: vi.fn(),
  };
});

function createMockClient() {
  return {
    query: vi.fn(),
    execute: vi.fn(),
    batch: vi.fn(),
    firstOrNull: vi.fn(),
  };
}

function makeRequest(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost:7030/api/leaderboard");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Request(url.toString());
}

describe("GET /api/leaderboard", () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    vi.mocked(d1Module.getD1Client).mockReturnValue(
      mockClient as unknown as d1Module.D1Client,
    );
  });

  describe("query params validation", () => {
    it("should reject invalid period", async () => {
      const res = await GET(makeRequest({ period: "year" }));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid period");
    });

    it("should accept valid periods", async () => {
      for (const period of ["week", "month", "all"]) {
        mockClient.query.mockResolvedValueOnce({ results: [] });
        const res = await GET(makeRequest({ period }));
        expect(res.status).toBe(200);
      }
    });

    it("should reject limit < 1", async () => {
      const res = await GET(makeRequest({ limit: "0" }));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("limit must be");
    });

    it("should reject limit > 100", async () => {
      const res = await GET(makeRequest({ limit: "200" }));

      expect(res.status).toBe(400);
    });

    it("should reject non-numeric limit", async () => {
      const res = await GET(makeRequest({ limit: "abc" }));

      expect(res.status).toBe(400);
    });
  });

  describe("default behavior", () => {
    it("should default to period=week and limit=50", async () => {
      mockClient.query.mockResolvedValueOnce({ results: [] });

      const res = await GET(makeRequest());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.period).toBe("week");
      expect(body.entries).toEqual([]);

      // Check SQL includes date filter (week has a date condition)
      const sqlCall = mockClient.query.mock.calls[0]!;
      expect(sqlCall[0]).toContain("ur.hour_start >= ?");
    });
  });

  describe("successful response", () => {
    it("should return ranked entries with user info", async () => {
      mockClient.query.mockResolvedValueOnce({
        results: [
          {
            user_id: "u1",
            name: "Alice",
            image: "https://example.com/alice.jpg",
            slug: "alice",
            total_tokens: 5000000,
            input_tokens: 3000000,
            output_tokens: 1500000,
            cached_input_tokens: 500000,
          },
          {
            user_id: "u2",
            name: "Bob",
            image: null,
            slug: "bob",
            total_tokens: 3000000,
            input_tokens: 2000000,
            output_tokens: 800000,
            cached_input_tokens: 200000,
          },
        ],
      });

      const res = await GET(makeRequest({ period: "month" }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.period).toBe("month");
      expect(body.entries).toHaveLength(2);

      expect(body.entries[0]).toEqual({
        rank: 1,
        user: {
          name: "Alice",
          image: "https://example.com/alice.jpg",
          slug: "alice",
        },
        total_tokens: 5000000,
        input_tokens: 3000000,
        output_tokens: 1500000,
        cached_input_tokens: 500000,
      });

      expect(body.entries[1].rank).toBe(2);
      expect(body.entries[1].user.name).toBe("Bob");
    });

    it("should not include date filter for period=all", async () => {
      mockClient.query.mockResolvedValueOnce({ results: [] });

      await GET(makeRequest({ period: "all" }));

      const sqlCall = mockClient.query.mock.calls[0]!;
      expect(sqlCall[0]).not.toContain("ur.hour_start >= ?");
    });

    it("should only include users with slugs", async () => {
      mockClient.query.mockResolvedValueOnce({ results: [] });

      await GET(makeRequest());

      const sqlCall = mockClient.query.mock.calls[0]!;
      expect(sqlCall[0]).toContain("u.slug IS NOT NULL");
    });

    it("should pass limit to SQL", async () => {
      mockClient.query.mockResolvedValueOnce({ results: [] });

      await GET(makeRequest({ limit: "10" }));

      const sqlCall = mockClient.query.mock.calls[0]!;
      expect(sqlCall[0]).toContain("LIMIT ?");
      expect(sqlCall[1]).toContain(10);
    });
  });

  describe("error handling", () => {
    it("should return 500 on D1 failure", async () => {
      mockClient.query.mockRejectedValueOnce(new Error("D1 down"));

      const res = await GET(makeRequest());

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Failed to load leaderboard");
    });
  });
});
