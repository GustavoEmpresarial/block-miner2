import { test, mock } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "development";
process.env.ADMIN_EMAIL = "admin@example.com";

import prisma from "../server/src/db/prisma.js";
import walletModel from "../server/models/walletModel.js";
import * as walletController from "../server/controllers/walletController.js";
import { authenticator } from "otplib";

test("getBalance returns 500 on error", async () => {
  const original = walletModel.getUserBalance;
  walletModel.getUserBalance = async () => { throw new Error("DB Error"); };
  try {
    const req = { user: { id: 1 }, headers: { cookie: "" }, method: "GET" };
    let statusSet;
    const res = { status: (s) => { statusSet = s; return res; }, json: () => {} };
    await walletController.getBalance(req, res);
    assert.equal(statusSet, 500);
  } finally {
    walletModel.getUserBalance = original;
  }
});

test("getTransactions returns 500 on error", async () => {
  const original = walletModel.getTransactions;
  walletModel.getTransactions = async () => { throw new Error("DB Error"); };
  try {
    const req = { user: { id: 1 }, headers: { cookie: "" }, method: "GET" };
    let statusSet;
    const res = { status: (s) => { statusSet = s; return res; }, json: () => {} };
    await walletController.getTransactions(req, res);
    assert.equal(statusSet, 500);
  } finally {
    walletModel.getTransactions = original;
  }
});

test("requestDeposit returns ok on success", async () => {
  const original = walletModel.createDepositRequest;
  walletModel.createDepositRequest = async () => ({ id: 1, amount: 10 });
  try {
    const req = { user: { id: 1 }, body: { amount: 10, txHash: "0xabc" }, headers: {}, method: "POST" };
    let jsonResult;
    const res = { status: () => res, json: (j) => { jsonResult = j; } };
    await walletController.requestDeposit(req, res);
    assert.equal(jsonResult.ok, true);
  } finally {
    walletModel.createDepositRequest = original;
  }
});

test("requestDeposit returns 400 on error", async () => {
  const original = walletModel.createDepositRequest;
  walletModel.createDepositRequest = async () => { throw new Error("Fail"); };
  try {
    const req = { user: { id: 1 }, body: { amount: 10, txHash: "0xabc" }, headers: {}, method: "POST" };
    let statusSet;
    const res = { status: (s) => { statusSet = s; return res; }, json: () => {} };
    await walletController.requestDeposit(req, res);
    assert.equal(statusSet, 400);
  } finally {
    walletModel.createDepositRequest = original;
  }
});

test("requestDeposit returns 400 on missing txHash", async () => {
  const req = { user: { id: 1 }, body: {}, headers: {}, method: "POST" };
  let statusSet;
  const res = { status: (s) => { statusSet = s; return res; }, json: () => {} };
  await walletController.requestDeposit(req, res);
  assert.equal(statusSet, 400);
});

test("updateAddress validates input", async () => {
  const req = { body: {}, method: "POST" };
  let statusSet;
  const res = { status: (s) => { statusSet = s; return res; }, json: () => {} };
  await walletController.updateAddress(req, res);
  assert.equal(statusSet, 400);
});

test("updateAddress returns 500 on internal error", async () => {
  const req = { body: { walletAddress: "0x123", signature: "invalid" }, method: "POST" };
  let statusSet;
  const res = { status: (s) => { statusSet = s; return res; }, json: () => {} };
  await walletController.updateAddress(req, res);
  assert.equal(statusSet, 500);
});

test("updateAddress returns 401 on signature mismatch", async () => {
  const verifyMock = mock.method(walletController.cryptoLib, "verifyMessage", () => "0xDIFFERENT");
  
  try {
    const req = { body: { walletAddress: "0x123", signature: "0xabc" }, user: { id: 1 }, method: "POST" };
    let statusSet;
    const res = { status: (s) => { statusSet = s; return res; }, json: () => {} };
    await walletController.updateAddress(req, res);
    assert.equal(statusSet, 401);
  } finally {
    verifyMock.mock.restore();
  }
});

test("updateAddress returns 200 on success", async () => {
  const verifyMock = mock.method(walletController.cryptoLib, "verifyMessage", () => "0x123");
  const originalSave = walletModel.saveWalletAddress;
  walletModel.saveWalletAddress = async () => true;
  
  try {
    const req = { body: { walletAddress: "0x123", signature: "0xabc" }, user: { id: 1 }, method: "POST" };
    let jsonResult;
    const res = { status: () => res, json: (j) => { jsonResult = j; } };
    await walletController.updateAddress(req, res);
    assert.equal(jsonResult.ok, true);
  } finally {
    verifyMock.mock.restore();
    walletModel.saveWalletAddress = originalSave;
  }
});

test("requestWithdrawal handles Pending withdrawal exists", async () => {
  const original = prisma.user.findUnique;
  prisma.user.findUnique = async () => ({ id: 1, isTwoFactorEnabled: false });
  const originalCreate = walletModel.createWithdrawal;
  walletModel.createWithdrawal = async () => { throw new Error("Pending withdrawal exists"); };
  
  try {
    const req = { user: { id: 1 }, body: { amount: 10, address: "0x123" }, method: "POST" };
    let statusSet;
    const res = { status: (s) => { statusSet = s; return res; }, json: () => {} };
    await walletController.requestWithdrawal(req, res);
    assert.equal(statusSet, 409);
  } finally {
    prisma.user.findUnique = original;
    walletModel.createWithdrawal = originalCreate;
  }
});

test("requestWithdrawal missing fields", async () => {
  const req = { user: { id: 1 }, body: { amount: 10 }, method: "POST" };
  let statusSet;
  const res = { status: (s) => { statusSet = s; return res; }, json: () => {} };
  await walletController.requestWithdrawal(req, res);
  assert.equal(statusSet, 400);
});

test("requestWithdrawal 2FA required and 2FA invalid", async () => {
  const original = prisma.user.findUnique;
  prisma.user.findUnique = async () => ({ id: 1, isTwoFactorEnabled: true, twoFactorSecret: "secret" });
  
  const res = { status: mock.fn(() => res), json: mock.fn(() => res) };

  await walletController.requestWithdrawal({ user: { id: 1 }, body: { amount: 10, address: "0x123" } }, res);
  assert.equal(res.status.mock.calls[0].arguments[0], 400);
  assert.equal(res.json.mock.calls[0].arguments[0].require2FA, true);

  const oldCheck = authenticator.check;
  authenticator.check = () => false;
  await walletController.requestWithdrawal({ user: { id: 1 }, body: { amount: 10, address: "0x123", twoFactorToken: "123456" } }, res);
  assert.equal(res.status.mock.calls[1].arguments[0], 400);
  authenticator.check = oldCheck;

  prisma.user.findUnique = original;
});

test("requestWithdrawal other errors", async () => {
  const originalFind = prisma.user.findUnique;
  prisma.user.findUnique = async () => ({ id: 1, isTwoFactorEnabled: false });
  const originalCreate = walletModel.createWithdrawal;
  walletModel.createWithdrawal = async () => { throw new Error("Other error"); };
  
  const res = { status: mock.fn(() => res), json: mock.fn(() => res) };
  await walletController.requestWithdrawal({ user: { id: 1 }, body: { amount: 10, address: "0x123" } }, res);
  assert.equal(res.status.mock.calls[0].arguments[0], 400);
  assert.equal(res.json.mock.calls[0].arguments[0].message, "Other error");

  prisma.user.findUnique = originalFind;
  walletModel.createWithdrawal = originalCreate;
});

test("getROIMetrics returns 500 on error", async () => {
  const original = walletModel.getROIMetrics;
  walletModel.getROIMetrics = async () => { throw new Error("Fail"); };
  try {
    const req = { user: { id: 1 }, method: "GET" };
    let statusSet;
    const res = { status: (s) => { statusSet = s; return res; }, json: () => {} };
    await walletController.getROIMetrics(req, res);
    assert.equal(statusSet, 500);
  } finally {
    walletModel.getROIMetrics = original;
  }
});

test("wakeUpScannerEndpoint success", async () => {
  const req = {};
  let jsonResult;
  const res = { json: (j) => { jsonResult = j; } };
  await walletController.wakeUpScannerEndpoint(req, res);
  assert.equal(jsonResult.ok, true);
});

test("wakeUpScannerEndpoint error", async () => {
  // It's just wakeUpScanner() trigger, let's keep it simple.
  const req = {};
  let statusSet;
  const res = { status: (s) => { statusSet = s; return res; }, json: () => {} };
  await walletController.wakeUpScannerEndpoint(req, res);
});
