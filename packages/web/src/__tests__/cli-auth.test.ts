import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/auth/cli/route";
import * as d1Module from "@/lib/d1";

// Mock getD1Client
vi.mock("@/lib/d1", async (importOriginal) => {
  const original = await importOriginal<typeof d1Module>();
  return {
    ...original,
    getD1Client: vi.fn(),
  };
});

// Mock resolveUser
vi.mock("@/lib/auth-helpers", () => ({
  resolveUser: vi.fn(),
  E2E_TEST_USER_ID: "e2e-test-user-id",
  E2E_TEST_USER_EMAIL: "e2e@test.local",
}));

const { resolveUser } = (await import("@/lib/auth-helpers")) as unknown as {
  resolveUser: ReturnType<typeof vi.fn>;
};

function createMockClient() {
  return {
    query: vi.fn(),
    execute: vi.fn(),
    batch: vi.fn(),
    firstOrNull: vi.fn(),
  };
}

function makeRequest(callback?: string): Request {
  const url = callback
    ? `http://localhost:7030/api/auth/cli?callback=${encodeURIComponent(callback)}`
    : "http://localhost:7030/api/auth/cli";
  return new Request(url, { method: "GET" });
}

describe("GET /api/auth/cli", () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    vi.mocked(d1Module.getD1Client).mockReturnValue(
      mockClient as unknown as d1Module.D1Client
    );
  });

  describe("authentication", () => {
    it("should reject unauthenticated requests", async () => {
      vi.mocked(resolveUser).mockResolvedValueOnce(null);

      const res = await GET(makeRequest("http://localhost:9999/callback"));

      // Should redirect to login page with return URL
      expect(res.status).toBe(307);
      const location = res.headers.get("Location");
      expect(location).toContain("/login");
    });
  });

  describe("validation", () => {
    beforeEach(() => {
      vi.mocked(resolveUser).mockResolvedValue({
        userId: "u1",
        email: "test@example.com",
      });
    });

    it("should reject requests without callback parameter", async () => {
      const res = await GET(makeRequest());

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("callback");
    });

    it("should reject non-localhost callback URLs", async () => {
      const res = await GET(makeRequest("https://evil.com/steal"));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("localhost");
    });

    it("should accept localhost callback URLs", async () => {
      mockClient.firstOrNull.mockResolvedValueOnce({
        api_key: "existing-key-123",
      });

      const res = await GET(
        makeRequest("http://localhost:9999/callback")
      );

      expect(res.status).toBe(307);
      const location = res.headers.get("Location")!;
      expect(location).toContain("localhost:9999");
      expect(location).toContain("api_key=existing-key-123");
    });

    it("should accept 127.0.0.1 callback URLs", async () => {
      mockClient.firstOrNull.mockResolvedValueOnce({
        api_key: "existing-key-456",
      });

      const res = await GET(
        makeRequest("http://127.0.0.1:8888/callback")
      );

      expect(res.status).toBe(307);
      const location = res.headers.get("Location")!;
      expect(location).toContain("127.0.0.1:8888");
    });
  });

  describe("api key generation", () => {
    beforeEach(() => {
      vi.mocked(resolveUser).mockResolvedValue({
        userId: "u1",
        email: "test@example.com",
      });
    });

    it("should reuse existing api_key if user already has one", async () => {
      mockClient.firstOrNull.mockResolvedValueOnce({
        api_key: "existing-key-abc",
      });

      const res = await GET(
        makeRequest("http://localhost:9999/callback")
      );

      expect(res.status).toBe(307);
      const location = res.headers.get("Location")!;
      expect(location).toContain("api_key=existing-key-abc");
      // Should NOT have called execute to generate a new key
      expect(mockClient.execute).not.toHaveBeenCalled();
    });

    it("should generate new api_key if user has none", async () => {
      mockClient.firstOrNull.mockResolvedValueOnce({ api_key: null });
      mockClient.execute.mockResolvedValueOnce(undefined);

      const res = await GET(
        makeRequest("http://localhost:9999/callback")
      );

      expect(res.status).toBe(307);
      const location = res.headers.get("Location")!;
      expect(location).toContain("api_key=");
      // Should have called execute to save new key
      expect(mockClient.execute).toHaveBeenCalledOnce();
      expect(mockClient.execute.mock.calls[0]![0]).toContain(
        "UPDATE users SET api_key"
      );
    });

    it("should include email in callback redirect", async () => {
      vi.mocked(resolveUser).mockResolvedValue({
        userId: "u1",
        email: "test@example.com",
      });
      mockClient.firstOrNull.mockResolvedValueOnce({
        api_key: "key-xyz",
      });

      const res = await GET(
        makeRequest("http://localhost:9999/callback")
      );

      const location = res.headers.get("Location")!;
      expect(location).toContain("email=test%40example.com");
    });

    it("should return 500 on D1 failure", async () => {
      mockClient.firstOrNull.mockRejectedValueOnce(new Error("D1 down"));

      const res = await GET(
        makeRequest("http://localhost:9999/callback")
      );

      expect(res.status).toBe(500);
    });
  });
});
