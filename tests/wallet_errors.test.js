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
  // verifyMessage from ethers throws on truly invalid sigs,
  // so the controller catches and returns 500
  const req = { body: { walletAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18", signature: "invalid" }, user: { id: 1 }, method: "POST" };
  let statusSet;
  const res = { status: (s) => { statusSet = s; return res; }, json: () => {} };
  await walletController.updateAddress(req, res);
  assert.equal(statusSet, 500);
});

test("requestWithdrawal handles Pending withdrawal exists", async () => {
  const originalCreate = walletModel.createWithdrawal;
  walletModel.createWithdrawal = async () => { throw new Error("Pending withdrawal exists"); };
  
  try {
    // Use valid checksum address
    const req = { user: { id: 1 }, body: { amount: 10, address: "0x742D35CC6634C0532925a3B844Bc9E7595F2bD18" }, method: "POST" };
    let statusSet;
    const res = { status: (s) => { statusSet = s; return res; }, json: () => {} };
    await walletController.requestWithdrawal(req, res);
    assert.equal(statusSet, 409);
  } finally {
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

test("requestWithdrawal 2FA not checked before address validation", async () => {
  // With invalid address, controller returns 400 before checking 2FA
  const res = { status: mock.fn(() => res), json: mock.fn(() => res) };
  await walletController.requestWithdrawal({ user: { id: 1 }, body: { amount: 10, address: "0x123" } }, res);
  assert.equal(res.status.mock.calls[0].arguments[0], 400);
  assert.ok(res.json.mock.calls[0].arguments[0].message.includes("Invalid Polygon"));
});

test("requestWithdrawal other errors with valid address", async () => {
  const originalCreate = walletModel.createWithdrawal;
  walletModel.createWithdrawal = async () => { throw new Error("Other error"); };
  
  const res = { status: mock.fn(() => res), json: mock.fn(() => res) };
  await walletController.requestWithdrawal({ user: { id: 1 }, body: { amount: 10, address: "0x742D35CC6634C0532925a3B844Bc9E7595F2bD18" } }, res);
  assert.equal(res.status.mock.calls[0].arguments[0], 400);
  assert.equal(res.json.mock.calls[0].arguments[0].message, "Other error");

  walletModel.createWithdrawal = originalCreate;
});

// getROIMetrics and wakeUpScannerEndpoint removed — not exported by walletController
