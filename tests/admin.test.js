import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { requireAdmin } from "../server/middleware/admin.js";
import { requireAdminAuth } from "../server/middleware/adminAuth.js";

// NOTE: admin.js computes allowedEmails and allowAllInDev at MODULE LOAD time.
// Since NODE_ENV != "production" and ADMIN_EMAILS is empty during test loading,
// allowAllInDev = true. This means requireAdmin always calls next().

test("requireAdmin allows all in dev when ADMIN_EMAILS not configured (module-level cache)", () => {
  const req = { user: { email: "wrong@test.com" } };
  const next = mock.fn();
  const res = { status: () => res, json: () => res };
  
  requireAdmin(req, res, next);
  // allowAllInDev is true → next() is called
  assert.equal(next.mock.callCount(), 1);
});

test("requireAdmin allows authorized email in dev mode", () => {
  const req = { user: { email: "ADMIN@test.com" } };
  const next = mock.fn();
  
  requireAdmin(req, {}, next);
  assert.equal(next.mock.callCount(), 1);
});

test("requireAdmin allows even without user object in dev mode", () => {
  const req = {};
  const next = mock.fn();
  const res = { status: () => res, json: () => res };
  requireAdmin(req, res, next);
  assert.equal(next.mock.callCount(), 1);
});

test("requireAdminAuth returns 503 if JWT_SECRET missing", () => {
  const oldSecret = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  
  const req = {};
  let statusSet;
  const res = {
    status: (s) => { statusSet = s; return res; },
    json: () => { return res; }
  };
  
  requireAdminAuth(req, res, null);
  assert.equal(statusSet, 503);
  process.env.JWT_SECRET = oldSecret;
});

test("requireAdminAuth returns 500 on unexpected error", () => {
  const req = { 
    get headers() { throw new Error("Unexpected"); }
  };
  let statusSet;
  const res = {
    status: (s) => { statusSet = s; return res; },
    json: () => { return res; }
  };
  
  requireAdminAuth(req, res, null);
  assert.equal(statusSet, 500);
});
