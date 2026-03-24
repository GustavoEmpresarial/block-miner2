import { test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../server/src/db/prisma.js";
import * as userModel from "../server/models/userModel.js";

test("userModel.getUserById returns user and audit logs", async () => {
  const original = prisma.user.findUnique;
  prisma.user.findUnique = async () => ({
    id: 1, name: "Test", email: "test@test.com", auditLogs: [{ action: "login" }]
  });

  try {
    const user = await userModel.getUserById(1);
    assert.equal(user.id, 1);
    assert.equal(user.auditLogs.length, 1);
  } finally {
    prisma.user.findUnique = original;
  }
});

test("userModel.updateUserLoginMeta updates metadata", async () => {
  const original = prisma.user.update;
  let updatedData;
  prisma.user.update = async (args) => { updatedData = args.data; return { id: 1 }; };

  try {
    await userModel.updateUserLoginMeta(1, { ip: "1.2.3.4", userAgent: "test-agent" });
    assert.equal(updatedData.ip, "1.2.3.4");
    assert.equal(updatedData.userAgent, "test-agent");
    assert.ok(updatedData.lastLoginAt instanceof Date);
  } finally {
    prisma.user.update = original;
  }
});

test("userModel.listUsers calculates total power correctly", async () => {
  const originalFindMany = prisma.user.findMany;
  const originalCount = prisma.user.count;

  prisma.user.findMany = async () => [
    {
      id: 1,
      polBalance: 50.5,
      miners: [{ hashRate: 10 }],
      gamePowers: [{ hashRate: 5 }],
      ytPowers: [{ hashRate: 2 }],
      gpuAccess: [{ gpuHashRate: 3 }]
    }
  ];
  prisma.user.count = async () => 1;

  try {
    const result = await userModel.listUsers({ page: 1, pageSize: 25 });
    assert.equal(result.total, 1);
    assert.equal(result.users[0].totalPower, 20);
    assert.equal(result.users[0].polBalance, 50.5);
    
    // Test with query and dates
    await userModel.listUsers({ page: 2, pageSize: 10, query: "test", fromDate: "2023-01-01", toDate: "2023-12-31" });
    assert.ok(true);
  } finally {
    prisma.user.findMany = originalFindMany;
    prisma.user.count = originalCount;
  }
});

test("userModel functions: banUser and getUserByRefCode", async () => {
  const oldUpdate = prisma.user.update;
  const oldFindUnique = prisma.user.findUnique;
  
  let updateData;
  prisma.user.update = async (args) => { updateData = args.data; return { id: 1 }; };
  prisma.user.findUnique = async () => ({ id: 1, username: "ref" });

  try {
    const { getUserByRefCode } = await import("../server/models/referralModel.js");
    
    const user = await getUserByRefCode("REF");
    assert.equal(user.username, "ref");
    
    await userModel.banUser(1, true);
    assert.equal(updateData.isBanned, true);
  } finally {
    prisma.user.update = oldUpdate;
    prisma.user.findUnique = oldFindUnique;
  }
});

