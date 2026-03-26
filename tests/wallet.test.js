import { test, mock } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "development";
process.env.ADMIN_EMAIL = "admin@example.com";

import prisma from "../server/src/db/prisma.js";
import walletModel from "../server/models/walletModel.js";
import * as walletController from "../server/controllers/walletController.js";
import { authenticator } from "otplib";

test("getBalance returns user balances", async () => {
  const original = prisma.user.findUnique;
  prisma.user.findUnique = async () => ({ 
    id: 1, 
    polBalance: 50, 
    usdcBalance: 10,
    miningLogs: [] 
  });
  
  // Mock aggregations too
  const originalAggregate = prisma.transaction.aggregate;
  prisma.transaction.aggregate = async () => ({ _sum: { amount: 0 } });

  try {
    const req = { user: { id: 1 }, headers: { cookie: "" }, method: "GET" };
    let jsonResult;
    const res = { 
      status: (s) => { return res; },
      json: (data) => { jsonResult = data; }
    };

    await walletController.getBalance(req, res);

    assert.equal(jsonResult.ok, true);
    assert.equal(jsonResult.balance, 50);
    } finally {
    prisma.user.findUnique = original;
    prisma.transaction.aggregate = originalAggregate;
    }
    });

    test("getTransactions returns user transactions", async () => {
    const original = walletModel.getTransactions;
    walletModel.getTransactions = async () => [{ id: 1, amount: 10 }];

    try {

    const req = { user: { id: 1 }, headers: { cookie: "" }, method: "GET" };
    let jsonResult;
    const res = { 
      status: (s) => { return res; },
      json: (data) => { jsonResult = data; }
    };

    await walletController.getTransactions(req, res);
    
    assert.equal(jsonResult.ok, true);
    assert.equal(jsonResult.transactions.length, 1);
  } finally {
    walletModel.listUserTransactions = original;
  }
});

test("requestDeposit returns 400 on missing data", async () => {
  const req = { body: {}, headers: {}, method: "POST" };
  let statusSet;
  const res = {
    status: (s) => { statusSet = s; return res; },
    json: () => {}
  };
  await walletController.requestDeposit(req, res);
  assert.equal(statusSet, 400);
});

test("requestWithdrawal validates address format", async () => {
  const req = { user: { id: 1 }, body: { amount: 10, address: "0x123" }, headers: {}, method: "POST" };
  let statusSet, jsonResult;
  const res = {
    status: (s) => { statusSet = s; return res; },
    json: (j) => { jsonResult = j; }
  };
  
  await walletController.requestWithdrawal(req, res);
  assert.equal(statusSet, 400);
  assert.ok(jsonResult.message.includes("Invalid Polygon wallet address"));
});

test("getBalance returns 500 on error", async () => {
  const original = walletModel.getUserBalance;
  walletModel.getUserBalance = async () => { throw new Error("DB Error"); };
  try {
    const req = { user: { id: 1 } };
    let status;
    const res = { status: (s) => { status = s; return res; }, json: () => {} };
    await walletController.getBalance(req, res);
    assert.equal(status, 500);
  } finally {
    walletModel.getUserBalance = original;
  }
});

test("updateAddress handles error", async () => {
  const req = { user: { id: 1 }, body: { walletAddress: "0x123", signature: "invalid" } };
  let status;
  const res = { status: (s) => { status = s; return res; }, json: () => {} };
  // ethers.verifyMessage throws on invalid signature format
  await walletController.updateAddress(req, res);
  assert.equal(status, 500);
});
