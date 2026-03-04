const test = require("node:test");
const assert = require("node:assert/strict");

process.env.NODE_ENV = process.env.NODE_ENV || "development";
process.env.DB_PATH = process.env.DB_PATH || "./data/blockminer.db";
process.env.CHECKIN_RECEIVER = "0x0000000000000000000000000000000000000000";

const { __test } = require("../controllers/walletController");
const { close } = require("../src/db/sqlite");

test.after(async () => {
  await close();
});

test("normalizeAmountInput accepts up to 6 decimal places", () => {
  const value = __test.normalizeAmountInput("10.123456");
  assert.equal(value, 10.123456);
});

test("normalizeAmountInput rejects invalid amount formats", () => {
  assert.throws(() => __test.normalizeAmountInput("10.1234567"), /Invalid amount format/);
  assert.throws(() => __test.normalizeAmountInput("abc"), /Invalid amount format/);
});

test("validateWithdrawalInput validates amount and address", () => {
  const amount = __test.validateWithdrawalInput("10.5", "0x000000000000000000000000000000000000dead");
  assert.equal(amount, 10.5);
});
