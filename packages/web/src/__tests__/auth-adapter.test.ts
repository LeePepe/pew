import { describe, it, expect, vi, beforeEach } from "vitest";
import { D1AuthAdapter } from "../lib/auth-adapter";
import { D1Client } from "../lib/d1";

// Create a mock D1Client
function createMockClient() {
  return {
    query: vi.fn(),
    execute: vi.fn(),
    batch: vi.fn(),
    firstOrNull: vi.fn(),
  } as unknown as D1Client;
}

describe("D1AuthAdapter", () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let adapter: ReturnType<typeof D1AuthAdapter>;

  beforeEach(() => {
    mockClient = createMockClient();
    adapter = D1AuthAdapter(mockClient);
  });

  describe("createUser()", () => {
    it("should insert user and return it", async () => {
      const mockUser = {
        id: "u1",
        email: "test@example.com",
        name: "Test User",
        image: "https://example.com/avatar.jpg",
        emailVerified: new Date("2026-01-01"),
      };

      vi.mocked(mockClient.execute).mockResolvedValueOnce({
        changes: 1,
        duration: 0.01,
      });

      const result = await adapter.createUser!(mockUser);

      expect(result).toEqual(mockUser);
      expect(mockClient.execute).toHaveBeenCalledOnce();
      const [sql, params] = vi.mocked(mockClient.execute).mock.calls[0]!;
      expect(sql).toContain("INSERT INTO users");
      expect(params).toContain("test@example.com");
    });
  });

  describe("getUser()", () => {
    it("should return user by id", async () => {
      vi.mocked(mockClient.firstOrNull).mockResolvedValueOnce({
        id: "u1",
        email: "test@example.com",
        name: "Test",
        image: null,
        email_verified: "2026-01-01T00:00:00.000Z",
      });

      const result = await adapter.getUser!("u1");

      expect(result).toEqual({
        id: "u1",
        email: "test@example.com",
        name: "Test",
        image: null,
        emailVerified: new Date("2026-01-01T00:00:00.000Z"),
      });
    });

    it("should return null when user not found", async () => {
      vi.mocked(mockClient.firstOrNull).mockResolvedValueOnce(null);

      const result = await adapter.getUser!("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("getUserByEmail()", () => {
    it("should return user by email", async () => {
      vi.mocked(mockClient.firstOrNull).mockResolvedValueOnce({
        id: "u1",
        email: "test@example.com",
        name: "Test",
        image: null,
        email_verified: null,
      });

      const result = await adapter.getUserByEmail!("test@example.com");

      expect(result).toEqual({
        id: "u1",
        email: "test@example.com",
        name: "Test",
        image: null,
        emailVerified: null,
      });
      expect(mockClient.firstOrNull).toHaveBeenCalledWith(
        expect.stringContaining("WHERE email = ?"),
        ["test@example.com"]
      );
    });
  });

  describe("getUserByAccount()", () => {
    it("should return user linked to provider account", async () => {
      vi.mocked(mockClient.firstOrNull).mockResolvedValueOnce({
        id: "u1",
        email: "test@example.com",
        name: "Test",
        image: null,
        email_verified: null,
      });

      const result = await adapter.getUserByAccount!({
        provider: "google",
        providerAccountId: "google-123",
      });

      expect(result).toEqual({
        id: "u1",
        email: "test@example.com",
        name: "Test",
        image: null,
        emailVerified: null,
      });
      const [sql, params] = vi.mocked(mockClient.firstOrNull).mock.calls[0]!;
      expect(sql).toContain("JOIN accounts");
      expect(params).toContain("google");
      expect(params).toContain("google-123");
    });

    it("should return null when no linked account", async () => {
      vi.mocked(mockClient.firstOrNull).mockResolvedValueOnce(null);

      const result = await adapter.getUserByAccount!({
        provider: "google",
        providerAccountId: "nonexistent",
      });

      expect(result).toBeNull();
    });
  });

  describe("linkAccount()", () => {
    it("should insert account record", async () => {
      vi.mocked(mockClient.execute).mockResolvedValueOnce({
        changes: 1,
        duration: 0.01,
      });

      await adapter.linkAccount!({
        userId: "u1",
        type: "oauth" as const,
        provider: "google",
        providerAccountId: "google-123",
        access_token: "at",
        refresh_token: "rt",
        expires_at: 1234567890,
        token_type: "bearer" as const,
        scope: "openid email profile",
        id_token: "idt",
      });

      expect(mockClient.execute).toHaveBeenCalledOnce();
      const [sql, params] = vi.mocked(mockClient.execute).mock.calls[0]!;
      expect(sql).toContain("INSERT INTO accounts");
      expect(params).toContain("google");
      expect(params).toContain("google-123");
    });
  });

  describe("updateUser()", () => {
    it("should update user fields", async () => {
      vi.mocked(mockClient.execute).mockResolvedValueOnce({
        changes: 1,
        duration: 0.01,
      });
      vi.mocked(mockClient.firstOrNull).mockResolvedValueOnce({
        id: "u1",
        email: "new@example.com",
        name: "New Name",
        image: null,
        email_verified: null,
      });

      const result = await adapter.updateUser!({
        id: "u1",
        name: "New Name",
        email: "new@example.com",
      });

      expect(result.name).toBe("New Name");
      expect(mockClient.execute).toHaveBeenCalledOnce();
    });
  });
});
