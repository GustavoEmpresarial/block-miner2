import { test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../server/src/db/prisma.js";
import * as userController from "../server/controllers/userController.js";

test("userController.getReferrals returns user referrals", async () => {
  const original = prisma.referral.findMany;
  prisma.referral.findMany = async () => [
    { id: 1, referrerId: 1, referredId: 2, createdAt: new Date(), referred: { id: 2, username: "ref1" } }
  ];

  try {
    const req = { user: { id: 1 } };
    let jsonResult;
    const res = {
      status: (s) => res,
      json: (data) => { jsonResult = data; }
    };

    await userController.getReferrals(req, res);

    assert.equal(jsonResult.ok, true);
    assert.equal(jsonResult.referrals.length, 1);
    assert.equal(jsonResult.referrals[0].referred.username, "ref1");
  } finally {
    prisma.referral.findMany = original;
  }
});

test("userController.changeUsername updates username", async () => {
  const originalFindFirst = prisma.user.findFirst;
  const originalUpdate = prisma.user.update;
  
  prisma.user.findFirst = async () => null; // No existing user with that name
  prisma.user.update = async () => ({ id: 1, username: "newname" });

  try {
    const req = { user: { id: 1 }, body: { username: "newname" } };
    let jsonResult;
    const res = {
      status: (s) => res,
      json: (data) => { jsonResult = data; }
    };

    await userController.changeUsername(req, res);

    assert.equal(jsonResult.ok, true);
    assert.equal(jsonResult.message, "Nome de usuário alterado com sucesso.");
  } finally {
    prisma.user.findFirst = originalFindFirst;
    prisma.user.update = originalUpdate;
  }
});

test("userController.changeUsername returns 409 if username taken", async () => {
  const originalFindFirst = prisma.user.findFirst;
  prisma.user.findFirst = async () => ({ id: 2, username: "taken" });

  try {
    const req = { user: { id: 1 }, body: { username: "taken" } };
    let statusSet;
    const res = {
      status: (s) => { statusSet = s; return res; },
      json: () => {}
    };

    await userController.changeUsername(req, res);
    assert.equal(statusSet, 409);
  } finally {
    prisma.user.findFirst = originalFindFirst;
  }
});

test("userController.get2FAStatus returns status", async () => {
  const original = prisma.user.findUnique;
  prisma.user.findUnique = async () => ({ id: 1, isTwoFactorEnabled: true });

  try {
    const req = { user: { id: 1 } };
    let jsonResult;
    const res = {
      status: (s) => res,
      json: (data) => { jsonResult = data; }
    };

    await userController.get2FAStatus(req, res);

    assert.equal(jsonResult.ok, true);
    assert.equal(jsonResult.isTwoFactorEnabled, true);
  } finally {
    prisma.user.findUnique = original;
  }
});

test("userController.reportAdblock logs to audit log", async () => {
  const original = prisma.auditLog.create;
  let createdData;
  prisma.auditLog.create = async (args) => { createdData = args.data; return { id: 1 }; };

  try {
    const req = { user: { id: 1 }, body: { detected: true }, ip: "127.0.0.1", headers: { "user-agent": "test" } };
    let jsonResult;
    const res = {
      status: (s) => res,
      json: (data) => { jsonResult = data; }
    };

    await userController.reportAdblock(req, res);

    assert.equal(jsonResult.ok, true);
    assert.equal(createdData.userId, 1);
    assert.equal(createdData.action, "adblock_detected");
    assert.equal(createdData.details.detected, true);
  } finally {
    prisma.auditLog.create = original;
  }
});

test("userController.generate2FA returns QR code", async () => {
  const originalFindUnique = prisma.user.findUnique;
  const originalUpdate = prisma.user.update;
  
  prisma.user.findUnique = async () => ({ id: 1, email: "test@test.com", isTwoFactorEnabled: false });
  prisma.user.update = async () => ({ id: 1 });

  try {
    const req = { user: { id: 1 } };
    let jsonResult;
    const res = {
      status: (s) => res,
      json: (data) => { jsonResult = data; }
    };

    await userController.generate2FA(req, res);

    assert.equal(jsonResult.ok, true);
    assert.ok(jsonResult.qrCodeUrl);
    assert.ok(jsonResult.secret);
  } finally {
    prisma.user.findUnique = originalFindUnique;
    prisma.user.update = originalUpdate;
  }
});

import { authenticator } from "otplib";

test("userController.enable2FA enables 2FA if token valid", async () => {
  const originalFindUnique = prisma.user.findUnique;
  const originalUpdate = prisma.user.update;
  const originalCheck = authenticator.check;

  prisma.user.findUnique = async () => ({ id: 1, isTwoFactorEnabled: false, twoFactorSecret: "secret" });
  prisma.user.update = async () => ({ id: 1 });
  authenticator.check = () => true;

  try {
    const req = { user: { id: 1 }, body: { token: "123456" } };
    let jsonResult;
    const res = {
      status: (s) => res,
      json: (data) => { jsonResult = data; }
    };

    await userController.enable2FA(req, res);

    assert.equal(jsonResult.ok, true);
    assert.equal(jsonResult.message, "2FA ativado com sucesso.");
  } finally {
    prisma.user.findUnique = originalFindUnique;
    prisma.user.update = originalUpdate;
    authenticator.check = originalCheck;
  }
});

test("userController.disable2FA disables 2FA if token valid", async () => {
  const originalFindUnique = prisma.user.findUnique;
  const originalUpdate = prisma.user.update;
  const originalCheck = authenticator.check;

  prisma.user.findUnique = async () => ({ id: 1, isTwoFactorEnabled: true, twoFactorSecret: "secret" });
  prisma.user.update = async () => ({ id: 1 });
  authenticator.check = () => true;

  try {
    const req = { user: { id: 1 }, body: { token: "123456" } };
    let jsonResult;
    const res = {
      status: (s) => res,
      json: (data) => { jsonResult = data; }
    };

    await userController.disable2FA(req, res);

    assert.equal(jsonResult.ok, true);
    assert.equal(jsonResult.message, "2FA desativado com sucesso.");
  } finally {
    prisma.user.findUnique = originalFindUnique;
    prisma.user.update = originalUpdate;
    authenticator.check = originalCheck;
  }
});

test("userController.enable2FA returns 400 if token invalid", async () => {
  const originalFindUnique = prisma.user.findUnique;
  const originalCheck = authenticator.check;

  prisma.user.findUnique = async () => ({ id: 1, isTwoFactorEnabled: false, twoFactorSecret: "secret" });
  authenticator.check = () => false;

  try {
    const req = { user: { id: 1 }, body: { token: "000000" } };
    let statusSet;
    const res = {
      status: (s) => { statusSet = s; return res; },
      json: () => {}
    };

    await userController.enable2FA(req, res);
    assert.equal(statusSet, 400);
  } finally {
    prisma.user.findUnique = originalFindUnique;
    authenticator.check = originalCheck;
  }
});
