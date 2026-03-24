import { test, mock } from "node:test";
import assert from "node:assert/strict";
import prisma from "../server/src/db/prisma.js";
import * as userController from "../server/controllers/userController.js";
import { authenticator } from "otplib";

test("userController.changeUsername errors and branches", async () => {
  const req = { user: { id: 1 }, body: {} };
  const res = {
    status: mock.fn((s) => res),
    json: mock.fn(() => res)
  };

  // Case: username missing or too short
  req.body.username = "ab";
  await userController.changeUsername(req, res);
  assert.equal(res.status.mock.calls[0].arguments[0], 400);

  // Case: username already in use
  const oldFindFirst = prisma.user.findFirst;
  prisma.user.findFirst = async () => ({ id: 2, username: "taken" });
  req.body.username = "taken";
  await userController.changeUsername(req, res);
  assert.equal(res.status.mock.calls[1].arguments[0], 409);
  prisma.user.findFirst = oldFindFirst;

  // Case: DB error in catch block
  const oldUpdate = prisma.user.update;
  prisma.user.update = async () => { throw new Error("DB Error"); };
  req.body.username = "newname";
  await userController.changeUsername(req, res);
  assert.equal(res.status.mock.calls[2].arguments[0], 500);
  prisma.user.update = oldUpdate;
});

test("userController.generate2FA errors and branches", async () => {
  const req = { user: { id: 1 } };
  const res = {
    status: mock.fn((s) => res),
    json: mock.fn(() => res)
  };

  const oldFindUnique = prisma.user.findUnique;
  
  // Case: 2FA already enabled
  prisma.user.findUnique = async () => ({ id: 1, isTwoFactorEnabled: true });
  await userController.generate2FA(req, res);
  assert.equal(res.status.mock.calls[0].arguments[0], 400);

  // Case: DB error in catch block
  prisma.user.findUnique = async () => { throw new Error("DB Error"); };
  await userController.generate2FA(req, res);
  assert.equal(res.status.mock.calls[1].arguments[0], 500);

  prisma.user.findUnique = oldFindUnique;
});

test("userController.enable2FA errors and branches", async () => {
  const req = { user: { id: 1 }, body: { token: "123456" } };
  const res = {
    status: mock.fn((s) => res),
    json: mock.fn(() => res)
  };

  const oldFindUnique = prisma.user.findUnique;

  // Case: 2FA already enabled
  prisma.user.findUnique = async () => ({ id: 1, isTwoFactorEnabled: true });
  await userController.enable2FA(req, res);
  assert.equal(res.status.mock.calls[0].arguments[0], 400);

  // Case: Secret not generated
  prisma.user.findUnique = async () => ({ id: 1, isTwoFactorEnabled: false, twoFactorSecret: null });
  await userController.enable2FA(req, res);
  assert.equal(res.status.mock.calls[1].arguments[0], 400);

  // Case: Invalid token
  prisma.user.findUnique = async () => ({ id: 1, isTwoFactorEnabled: false, twoFactorSecret: "secret" });
  const oldCheck = authenticator.check;
  authenticator.check = () => false;
  await userController.enable2FA(req, res);
  assert.equal(res.status.mock.calls[2].arguments[0], 400);
  authenticator.check = oldCheck;

  // Case: DB error in catch block
  prisma.user.findUnique = async () => { throw new Error("DB Error"); };
  await userController.enable2FA(req, res);
  assert.equal(res.status.mock.calls[3].arguments[0], 500);

  prisma.user.findUnique = oldFindUnique;
});

test("userController.disable2FA errors and branches", async () => {
  const req = { user: { id: 1 }, body: { token: "123456" } };
  const res = {
    status: mock.fn((s) => res),
    json: mock.fn(() => res)
  };

  const oldFindUnique = prisma.user.findUnique;

  // Case: 2FA not enabled
  prisma.user.findUnique = async () => ({ id: 1, isTwoFactorEnabled: false });
  await userController.disable2FA(req, res);
  assert.equal(res.status.mock.calls[0].arguments[0], 400);

  // Case: Invalid token
  prisma.user.findUnique = async () => ({ id: 1, isTwoFactorEnabled: true, twoFactorSecret: "secret" });
  const oldCheck = authenticator.check;
  authenticator.check = () => false;
  await userController.disable2FA(req, res);
  assert.equal(res.status.mock.calls[1].arguments[0], 400);
  authenticator.check = oldCheck;

  // Case: DB error in catch block
  prisma.user.findUnique = async () => { throw new Error("DB Error"); };
  await userController.disable2FA(req, res);
  assert.equal(res.status.mock.calls[2].arguments[0], 500);

  prisma.user.findUnique = oldFindUnique;
});

test("userController.get2FAStatus and others catch blocks", async () => {
  const res = {
    status: mock.fn((s) => res),
    json: mock.fn(() => res)
  };

  const oldFindUnique = prisma.user.findUnique;
  const oldFindMany = prisma.referral.findMany;
  const oldCreate = prisma.auditLog.create;

  prisma.user.findUnique = async () => { throw new Error("DB Error"); };
  prisma.referral.findMany = async () => { throw new Error("DB Error"); };
  prisma.auditLog.create = async () => { throw new Error("DB Error"); };

  // get2FAStatus catch
  await userController.get2FAStatus({ user: { id: 1 } }, res);
  assert.equal(res.status.mock.calls[0].arguments[0], 500);

  // getReferrals catch
  await userController.getReferrals({ user: { id: 1 } }, res);
  assert.equal(res.status.mock.calls[1].arguments[0], 500);

  // reportAdblock catch
  await userController.reportAdblock({ user: { id: 1 }, body: { detected: true } }, res);
  assert.equal(res.status.mock.calls[2].arguments[0], 500);

  prisma.user.findUnique = oldFindUnique;
  prisma.referral.findMany = oldFindMany;
  prisma.auditLog.create = oldCreate;
});
