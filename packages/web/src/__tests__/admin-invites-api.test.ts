import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be before imports that trigger the module chain
// ---------------------------------------------------------------------------

vi.mock("@/lib/d1", () => ({
  getD1Client: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({
  resolveAdmin: vi.fn(),
}));

vi.mock("@/auth", () => ({
  shouldUseSecureCookies: vi.fn(() => false),
}));

// generateInviteCode always returns a predictable value for tests
let inviteCallCount = 0;
vi.mock("@/lib/invite", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/invite")>();
  return {
    ...original,
    generateInviteCode: vi.fn(() => {
      inviteCallCount++;
      return `CODE${String(inviteCallCount).padStart(4, "0")}`;
    }),
  };
});

import { GET, POST, DELETE } from "@/app/api/admin/invites/route";
import * as d1Module from "@/lib/d1";

const { resolveAdmin } = (await import("@/lib/admin")) as unknown as {
  resolveAdmin: ReturnType<typeof vi.fn>;
};

function createMockClient() {
  return {
    query: vi.fn(),
    execute: vi.fn(),
    batch: vi.fn(),
    firstOrNull: vi.fn(),
  };
}

function makeRequest(
  method: string,
  url = "http://localhost:7030/api/admin/invites",
  body?: unknown
): Request {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new Request(url, init);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/admin/invites", () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    vi.mocked(d1Module.getD1Client).mockReturnValue(
      mockClient as unknown as d1Module.D1Client
    );
  });

  it("should return 403 for non-admin", async () => {
    resolveAdmin.mockResolvedValueOnce(null);
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Forbidden");
  });

  it("should return rows for admin", async () => {
    resolveAdmin.mockResolvedValueOnce({
      userId: "admin-1",
      email: "admin@test.com",
    });
    const mockRows = [
      {
        id: 1,
        code: "A3K9X2M4",
        created_by: "admin-1",
        created_by_email: "admin@test.com",
        used_by: null,
        used_by_email: null,
        used_at: null,
        created_at: "2026-03-10T12:00:00Z",
      },
    ];
    mockClient.query.mockResolvedValueOnce({ results: mockRows });

    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rows).toEqual(mockRows);
  });
});

describe("POST /api/admin/invites", () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    vi.mocked(d1Module.getD1Client).mockReturnValue(
      mockClient as unknown as d1Module.D1Client
    );
  });

  it("should return 403 for non-admin", async () => {
    resolveAdmin.mockResolvedValueOnce(null);
    const res = await POST(makeRequest("POST", undefined, { count: 1 }));
    expect(res.status).toBe(403);
  });

  it("should generate N codes", async () => {
    resolveAdmin.mockResolvedValueOnce({
      userId: "admin-1",
      email: "admin@test.com",
    });
    // firstOrNull returns null (no collision)
    mockClient.firstOrNull.mockResolvedValue(null);
    mockClient.execute.mockResolvedValue({ changes: 1, duration: 0.01 });

    const res = await POST(makeRequest("POST", undefined, { count: 3 }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.codes).toHaveLength(3);
    // Each code should be a string
    for (const code of json.codes) {
      expect(typeof code).toBe("string");
    }
  });

  it("should reject count > 20", async () => {
    resolveAdmin.mockResolvedValueOnce({
      userId: "admin-1",
      email: "admin@test.com",
    });
    const res = await POST(makeRequest("POST", undefined, { count: 21 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("count must be at most 20");
  });

  it("should reject count < 1", async () => {
    resolveAdmin.mockResolvedValueOnce({
      userId: "admin-1",
      email: "admin@test.com",
    });
    const res = await POST(makeRequest("POST", undefined, { count: 0 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("count must be a positive integer");
  });
});

describe("DELETE /api/admin/invites", () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    vi.mocked(d1Module.getD1Client).mockReturnValue(
      mockClient as unknown as d1Module.D1Client
    );
  });

  it("should return 403 for non-admin", async () => {
    resolveAdmin.mockResolvedValueOnce(null);
    const res = await DELETE(
      makeRequest("DELETE", "http://localhost:7030/api/admin/invites?id=1")
    );
    expect(res.status).toBe(403);
  });

  it("should return 400 without id parameter", async () => {
    resolveAdmin.mockResolvedValueOnce({
      userId: "admin-1",
      email: "admin@test.com",
    });
    const res = await DELETE(makeRequest("DELETE"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("id query parameter is required");
  });

  it("should delete unused code (used_by IS NULL)", async () => {
    resolveAdmin.mockResolvedValueOnce({
      userId: "admin-1",
      email: "admin@test.com",
    });
    mockClient.firstOrNull.mockResolvedValueOnce({ used_by: null });
    mockClient.execute.mockResolvedValueOnce({ changes: 1, duration: 0.01 });

    const res = await DELETE(
      makeRequest("DELETE", "http://localhost:7030/api/admin/invites?id=1")
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deleted).toBe(true);
  });

  it("should delete burned pending:* code (reclaim)", async () => {
    resolveAdmin.mockResolvedValueOnce({
      userId: "admin-1",
      email: "admin@test.com",
    });
    mockClient.firstOrNull.mockResolvedValueOnce({
      used_by: "pending:google-account-id-123",
    });
    mockClient.execute.mockResolvedValueOnce({ changes: 1, duration: 0.01 });

    const res = await DELETE(
      makeRequest("DELETE", "http://localhost:7030/api/admin/invites?id=2")
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deleted).toBe(true);
  });

  it("should return 409 for fully used code (real user ID)", async () => {
    resolveAdmin.mockResolvedValueOnce({
      userId: "admin-1",
      email: "admin@test.com",
    });
    mockClient.firstOrNull.mockResolvedValueOnce({
      used_by: "user-uuid-abc123",
    });

    const res = await DELETE(
      makeRequest("DELETE", "http://localhost:7030/api/admin/invites?id=3")
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("Cannot delete a used invite code");
  });
});
