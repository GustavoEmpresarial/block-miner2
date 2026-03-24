import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { requireAdmin } from "../server/middleware/admin.js";
import { requireAdminAuth } from "../server/middleware/adminAuth.js";

test("requireAdmin blocks unauthorized email", () => {
  const oldNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  process.env.ADMIN_EMAIL = "admin@test.com";
  
  const req = { user: { email: "wrong@test.com" } };
  let statusSet;
  const res = {
    status: (s) => { statusSet = s; return res; },
    json: () => { return res; }
  };
  const next = mock.fn();
  
  requireAdmin(req, res, next);
  assert.equal(statusSet, 403);
  assert.equal(next.mock.callCount(), 0);
  process.env.NODE_ENV = oldNodeEnv;
});

test("requireAdmin allows authorized email (case insensitive and multiple)", () => {
  const oldEmails = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = "Admin@Test.com, other@test.com";
  
  const req = { user: { email: "ADMIN@test.com" } };
  const next = mock.fn();
  
  requireAdmin(req, {}, next);
  assert.equal(next.mock.callCount(), 1);
  process.env.ADMIN_EMAILS = oldEmails;
});

test("requireAdmin blocks if no user object", () => {
  process.env.ADMIN_EMAIL = "admin@test.com";
  const req = {};
  let statusSet;
  const res = { status: (s) => { statusSet = s; return res; }, json: () => {} };
  requireAdmin(req, res, null);
  assert.equal(statusSet, 403);
});

test("requireAdmin blocks if no admin configured in production", () => {
  const oldNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const oldEmails = process.env.ADMIN_EMAILS;
  const oldEmail = process.env.ADMIN_EMAIL;
  process.env.ADMIN_EMAILS = "";
  process.env.ADMIN_EMAIL = "";
  
  const req = { user: { email: "anyone@test.com" } };
  let statusSet;
  const res = {
    status: (s) => { statusSet = s; return res; },
    json: () => { return res; }
  };
  const next = mock.fn();
  
  requireAdmin(req, res, next);
  assert.equal(statusSet, 403);
  process.env.NODE_ENV = oldNodeEnv;
  process.env.ADMIN_EMAILS = oldEmails;
  process.env.ADMIN_EMAIL = oldEmail;
});

test("requireAdmin allows all in dev if no admin configured", () => {
  const oldNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  const oldEmails = process.env.ADMIN_EMAILS;
  const oldEmail = process.env.ADMIN_EMAIL;
  process.env.ADMIN_EMAILS = "";
  process.env.ADMIN_EMAIL = "";
  
  const req = { user: { email: "anyone@test.com" } };
  const res = { status: () => res, json: () => res };
  const next = mock.fn();
  
  requireAdmin(req, res, next);
  assert.equal(next.mock.callCount(), 1);
  
  process.env.NODE_ENV = oldNodeEnv;
  process.env.ADMIN_EMAILS = oldEmails;
  process.env.ADMIN_EMAIL = oldEmail;
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
