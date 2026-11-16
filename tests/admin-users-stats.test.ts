import test from "node:test";
import assert from "node:assert/strict";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { Module } from "@nestjs/common";
import { Role } from "@prisma/client";
import { UsersAdminController } from "../src/modules/auth/users-admin.controller";
import { StatsAdminController } from "../src/modules/auth/stats-admin.controller";
import { PrismaService } from "../src/lib/prisma.service";
import { AppExceptionFilter } from "../src/common/filters/app-exception.filter";
import { signAccessToken } from "../src/utils/jwt";

function createMockPrisma() {
  const users: any[] = [
    {
      id: "admin-1",
      email: "admin@test.kg",
      role: Role.ADMIN,
      firstName: "Admin",
      lastName: "User",
      phone: "+996555000001",
      isEmailVerified: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "customer-1",
      email: "customer@test.kg",
      role: Role.CUSTOMER,
      firstName: "Customer",
      lastName: "One",
      phone: "+996555000002",
      isEmailVerified: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  return {
    user: {
      async count(args: any) {
        if (!args || !args.where) return users.length;
        return users.filter((u) => {
          if (args.where.role && u.role !== args.where.role) return false;
          if (args.where.isActive !== undefined && u.isActive !== args.where.isActive) return false;
          return true;
        }).length;
      },
      async findMany(args: any) {
        let res = [...users];
        if (args?.where?.role) res = res.filter((u) => u.role === args.where.role);
        return res.map((u) => ({
          ...u,
          _count: { orders: 0, entitlements: 0, sessions: 0 },
        }));
      },
      async findUnique(args: any) {
        const found = users.find((u) => u.id === args.where.id);
        if (!found) return null;
        return {
          ...found,
          _count: { orders: 0, entitlements: 0, sessions: 0 },
          orders: [],
        };
      },
      async update(args: any) {
        const target = users.find((u) => u.id === args.where.id);
        if (!target) throw new Error("User not found");
        Object.assign(target, args.data, { updatedAt: new Date() });
        return target;
      },
    },
    product: {
      async count() {
        return 10;
      },
    },
    category: {
      async count() {
        return 4;
      },
    },
    order: {
      async count() {
        return 5;
      },
      async findMany() {
        return [];
      },
      async aggregate() {
        return { _sum: { totalAmount: 2500 } };
      },
    },
  };
}

async function createTestApp() {
  const mockPrisma = createMockPrisma();
  const mockPrismaService = { client: mockPrisma };

  @Module({
    controllers: [UsersAdminController, StatsAdminController],
    providers: [
      {
        provide: PrismaService,
        useValue: mockPrismaService,
      },
    ],
  })
  class TestAdminModule {}

  const adapter = new FastifyAdapter();
  const app = await NestFactory.create<NestFastifyApplication>(TestAdminModule, adapter, {
    logger: false,
  });

  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new AppExceptionFilter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return { app, mockPrisma };
}

test("Admin Users: Block CUSTOMER from accessing GET /api/v1/admin/users", async () => {
  const { app } = await createTestApp();

  const customerToken = signAccessToken({
    sub: "customer-1",
    email: "customer@test.kg",
    role: Role.CUSTOMER,
    sessionId: "sess-1",
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/v1/admin/users",
    headers: {
      authorization: `Bearer ${customerToken}`,
    },
  });

  assert.strictEqual(response.statusCode, 403);
  const json = JSON.parse(response.body);
  assert.strictEqual(json.success, false);
  assert.strictEqual(json.error.code, "INSUFFICIENT_PERMISSIONS");

  await app.close();
});

test("Admin Users: ADMIN can list users and view details", async () => {
  const { app } = await createTestApp();

  const adminToken = signAccessToken({
    sub: "admin-1",
    email: "admin@test.kg",
    role: Role.ADMIN,
    sessionId: "sess-admin",
  });

  // 1. List users
  const listRes = await app.inject({
    method: "GET",
    url: "/api/v1/admin/users?page=1&limit=10",
    headers: {
      authorization: `Bearer ${adminToken}`,
    },
  });

  assert.strictEqual(listRes.statusCode, 200);
  const listJson = JSON.parse(listRes.body);
  assert.strictEqual(listJson.success, true);
  assert.strictEqual(listJson.data.users.length, 2);
  assert.strictEqual(listJson.data.total, 2);

  // 2. View user details
  const detailRes = await app.inject({
    method: "GET",
    url: "/api/v1/admin/users/customer-1",
    headers: {
      authorization: `Bearer ${adminToken}`,
    },
  });

  assert.strictEqual(detailRes.statusCode, 200);
  const detailJson = JSON.parse(detailRes.body);
  assert.strictEqual(detailJson.success, true);
  assert.strictEqual(detailJson.data.email, "customer@test.kg");

  await app.close();
});

test("Admin Users: ADMIN can update user role and status", async () => {
  const { app, mockPrisma } = await createTestApp();

  const adminToken = signAccessToken({
    sub: "admin-1",
    email: "admin@test.kg",
    role: Role.ADMIN,
    sessionId: "sess-admin",
  });

  // 1. Promote customer to CONTENT_MANAGER
  const roleRes = await app.inject({
    method: "PATCH",
    url: "/api/v1/admin/users/customer-1/role",
    headers: {
      authorization: `Bearer ${adminToken}`,
    },
    payload: {
      role: "CONTENT_MANAGER",
    },
  });

  assert.strictEqual(roleRes.statusCode, 200);
  const roleJson = JSON.parse(roleRes.body);
  assert.strictEqual(roleJson.success, true);
  assert.strictEqual(roleJson.data.role, "CONTENT_MANAGER");

  // 2. Block user
  const statusRes = await app.inject({
    method: "PATCH",
    url: "/api/v1/admin/users/customer-1/status",
    headers: {
      authorization: `Bearer ${adminToken}`,
    },
    payload: {
      isActive: false,
    },
  });

  assert.strictEqual(statusRes.statusCode, 200);
  const statusJson = JSON.parse(statusRes.body);
  assert.strictEqual(statusJson.success, true);
  assert.strictEqual(statusJson.data.isActive, false);

  await app.close();
});

test("Admin Stats: ADMIN can access dashboard statistics", async () => {
  const { app } = await createTestApp();

  const adminToken = signAccessToken({
    sub: "admin-1",
    email: "admin@test.kg",
    role: Role.ADMIN,
    sessionId: "sess-admin",
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/v1/admin/stats",
    headers: {
      authorization: `Bearer ${adminToken}`,
    },
  });

  assert.strictEqual(response.statusCode, 200);
  const json = JSON.parse(response.body);
  assert.strictEqual(json.success, true);
  assert.strictEqual(json.data.products.total, 10);
  assert.strictEqual(json.data.categories.total, 4);
  assert.strictEqual(json.data.revenue.totalAmount, 2500);

  await app.close();
});
