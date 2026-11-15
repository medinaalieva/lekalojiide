import test from "node:test";
import assert from "node:assert/strict";
import { HealthService } from "../src/modules/health/health.service";

test("HealthService: checkLiveness returns status ok and server metadata", () => {
  const mockPrismaService: any = { client: {} };
  const service = new HealthService(mockPrismaService);

  const result = service.checkLiveness();

  assert.strictEqual(result.status, "ok");
  assert.strictEqual(result.service, "lekalo-zhiide-backend");
  assert.ok(typeof result.uptime === "number");
  assert.ok(result.timestamp);
});

test("HealthService: checkReadiness reports not_ready when PostgreSQL is unreachable", async () => {
  const mockPrismaService: any = {
    client: {
      async $queryRaw() {
        throw new Error("Can't reach database server at 127.0.0.1:5432");
      },
    },
  };
  const service = new HealthService(mockPrismaService);

  const result = await service.checkReadiness();

  assert.strictEqual(result.status, "not_ready");
  assert.strictEqual(result.database.status, "disconnected");
  assert.strictEqual(result.database.provider, "postgresql");
  assert.ok(result.database.error?.includes("127.0.0.1:5432"));
});

test("HealthService: checkReadiness reports ready when PostgreSQL responds", async () => {
  const mockPrismaService: any = {
    client: {
      async $queryRaw() {
        return [{ "?column?": 1 }];
      },
    },
  };
  const service = new HealthService(mockPrismaService);

  const result = await service.checkReadiness();

  assert.strictEqual(result.status, "ready");
  assert.strictEqual(result.database.status, "connected");
  assert.strictEqual(result.database.provider, "postgresql");
});
