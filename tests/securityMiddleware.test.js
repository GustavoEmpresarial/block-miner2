import { test, mock } from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "12345678901234567890123456789012";
process.env.ADMIN_EMAIL = "admin@example.com";

import * as authTokens from "../server/utils/authTokens.js";
import prisma from "../server/src/db/prisma.js";
import * as userModel from "../server/models/userModel.js";
import { getTokenFromRequest } from "../server/utils/token.js";

process.env.JWT_SECRET = "testsecret";

import { requireAuth, authenticateTokenOptional, requirePageAuth } from "../server/middleware/auth.js";
import { requireAdminAuth } from "../server/middleware/adminAuth.js";
import { requireAdmin } from "../server/middleware/admin.js";
import { createCsrfMiddleware } from "../server/middleware/csrf.js";
import jwt from "jsonwebtoken";

test("requireAuth blocks unauthorized", async () => {
  const req = { headers: {}, method: "GET" };
  let status;
  const res = {
    status: (s) => { status = s; return res; },
    json: () => {}
  };
  await requireAuth(req, res, null);
  assert.equal(status, 401);
});

test("requireAuth allows valid user", async () => {
  const token = authTokens.signAccessToken({ id: 1 });
  const oldFindUnique = prisma.user.findUnique;
  prisma.user.findUnique = async () => ({ id: 1, isBanned: false });
  
  try {
    const req = { headers: { cookie: `blockminer_access=${token}` }, method: "GET" };
    const next = mock.fn();
    await requireAuth(req, {}, next);
    assert.equal(next.mock.callCount(), 1);
    assert.equal(req.user.id, 1);
  } finally {
    prisma.user.findUnique = oldFindUnique;
  }
});

test("requireAuth blocks bot flag", async () => {
  const req = { headers: { "x-anti-bot": "1" }, method: "POST", ip: "1.2.3.4" };
  let status;
  const res = {
    status: (s) => { status = s; return res; },
    json: () => {}
  };
  await requireAuth(req, res, null);
  assert.equal(status, 403);
});

test("requireAuth blocks invalid token", async () => {
  const req = { headers: { cookie: "blockminer_access=invalid" }, method: "GET" };
  let status;
  const res = {
    status: (s) => { status = s; return res; },
    json: () => {}
  };
  await requireAuth(req, res, null);
  assert.equal(status, 401);
});

test("requireAuth blocks banned user", async () => {
  const token = authTokens.signAccessToken({ id: 1 });
  const oldFindUnique = prisma.user.findUnique;
  prisma.user.findUnique = async () => ({ id: 1, isBanned: true });

  try {
    const req = { headers: { cookie: `blockminer_access=${token}` }, method: "GET" };
    let statusSet;
    const res = {
      status: (s) => { statusSet = s; return res; },
      json: () => { return res; }
    };
    
    const next = mock.fn();
    await requireAuth(req, res, next);
    assert.equal(statusSet, 403);
    assert.equal(next.mock.callCount(), 0);
  } finally {
    prisma.user.findUnique = oldFindUnique;
  }
});

test("requireAuth blocks on invalid anti-bot payload decryption", async () => {
  const req = { 
    headers: { "x-anti-bot-payload": "invalid-base64!!", "x-anti-bot-key": "K" }, 
    method: "POST" 
  };
  let status;
  const res = {
    status: (s) => { status = s; return res; },
    json: () => {}
  };
  await requireAuth(req, res, null);
  assert.equal(status, 403);
});

test("requireAuth handles general error", async () => {
  const req = { 
    get headers() { throw new Error("Unexpected error"); },
    method: "POST"
  };
  let status;
  const res = {
    status: (s) => { status = s; return res; },
    json: () => {}
  };
  await requireAuth(req, res, null);
  assert.equal(status, 500);
});

test("requireAuth handles token verification error in non-production", async () => {
  const oldNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  const req = { headers: { cookie: "blockminer_access=invalid" }, method: "GET" };
  let status;
  const res = {
    status: (s) => { status = s; return res; },
    json: () => {}
  };
  await requireAuth(req, res, null);
  assert.equal(status, 401);
  process.env.NODE_ENV = oldNodeEnv;
});

test("requireAuth handles missing userId in payload", async () => {
  const token = jwt.sign({ foo: "bar" }, process.env.JWT_SECRET);
  const req = { headers: { cookie: `blockminer_access=${token}` }, method: "GET" };
  let status;
  const res = {
    status: (s) => { status = s; return res; },
    json: () => {}
  };
  await requireAuth(req, res, null);
  assert.equal(status, 401);
});

test("requireAdminAuth handles token verification error in non-production", async () => {
  const oldNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  const req = { headers: { cookie: "blockminer_admin_session=invalid" } };
  let status;
  const res = {
    status: (s) => { status = s; return res; },
    json: () => {}
  };
  await requireAdminAuth(req, res, null);
  assert.equal(status, 401);
  process.env.NODE_ENV = oldNodeEnv;
});

test("authenticateTokenOptional allows guest", async () => {
  const req = { headers: {} };
  const next = mock.fn();
  await authenticateTokenOptional(req, {}, next);
  assert.equal(next.mock.callCount(), 1);
});

test("authenticateTokenOptional handles catch block error", async () => {
  const token = authTokens.signAccessToken({ id: 1 });
  const req = { headers: { cookie: `blockminer_access=${token}` } };
  const next = mock.fn();
  
  const oldFindUnique = prisma.user.findUnique;
  prisma.user.findUnique = async () => { throw new Error("DB Error"); };

  try {
    await authenticateTokenOptional(req, {}, next);
    assert.equal(next.mock.callCount(), 1);
  } finally {
    prisma.user.findUnique = oldFindUnique;
  }
});

test("requirePageAuth allows valid user", async () => {
  const token = authTokens.signAccessToken({ id: 1 });
  const oldFindUnique = prisma.user.findUnique;
  prisma.user.findUnique = async () => ({ id: 1, isBanned: false });
  
  try {
    const req = { headers: { cookie: `blockminer_access=${token}` } };
    const next = mock.fn();
    await requirePageAuth(req, {}, next);
    assert.equal(next.mock.callCount(), 1);
  } finally {
    prisma.user.findUnique = oldFindUnique;
  }
});

test("requirePageAuth handles various failures", async () => {
  const oldFindUnique = prisma.user.findUnique;
  
  // 1. verifyAccessToken fails
  const req1 = { headers: { cookie: `blockminer_access=invalid` } };
  let redirect1;
  const res1 = { redirect: (code, url) => { redirect1 = url; } };
  await requirePageAuth(req1, res1, null);
  assert.equal(redirect1, "/login");

  // 2. missing userId in payload
  const token2 = jwt.sign({ foo: "bar" }, process.env.JWT_SECRET);
  const req2 = { headers: { cookie: `blockminer_access=${token2}` } };
  let redirect2;
  const res2 = { redirect: (code, url) => { redirect2 = url; } };
  await requirePageAuth(req2, res2, null);
  assert.equal(redirect2, "/login");

  // 3. user missing in DB
  process.env.JWT_SECRET = "testsecret";
  const token3 = authTokens.signAccessToken({ id: 999 });
  prisma.user.findUnique = async () => null;
  const req3 = { headers: { cookie: `blockminer_access=${token3}` } };
  let redirect3;
  const res3 = { redirect: (code, url) => { redirect3 = url; } };
  await requirePageAuth(req3, res3, null);
  assert.equal(redirect3, "/login");

  // 4. Banned user
  prisma.user.findUnique = async () => ({ id: 1, isBanned: true });
  const req4 = { headers: { cookie: `blockminer_access=${token3}` } };
  let redirect4;
  const res4 = { redirect: (code, url) => { redirect4 = url; } };
  await requirePageAuth(req4, res4, null);
  assert.equal(redirect4, "/login");

  // 5. Catch block
  prisma.user.findUnique = async () => { throw new Error("Hard fail"); };
  const req5 = { headers: { cookie: `blockminer_access=${token3}` } };
  let redirect5;
  const res5 = { redirect: (code, url) => { redirect5 = url; } };
  await requirePageAuth(req5, res5, null);
  assert.equal(redirect5, "/login");

  prisma.user.findUnique = oldFindUnique;
});

test("authenticateTokenOptional handles various failures", async () => {
  const oldFindUnique = prisma.user.findUnique;
  
  // 1. verifyAccessToken fails
  const req1 = { headers: { cookie: `blockminer_access=invalid` } };
  const next1 = mock.fn();
  await authenticateTokenOptional(req1, {}, next1);
  assert.equal(next1.mock.callCount(), 1);

  // 2. missing userId
  const token2 = jwt.sign({ foo: "bar" }, process.env.JWT_SECRET);
  const req2 = { headers: { cookie: `blockminer_access=${token2}` } };
  const next2 = mock.fn();
  await authenticateTokenOptional(req2, {}, next2);
  assert.equal(next2.mock.callCount(), 1);

  prisma.user.findUnique = oldFindUnique;
});

test("requireAdminAuth allows valid admin token", async () => {
  const secret = process.env.JWT_SECRET;
  const token = jwt.sign(
    { role: "admin", type: "admin_session" }, 
    secret, 
    { issuer: "blockminer-admin", algorithm: "HS256" }
  );
  
  const req = { headers: { cookie: `blockminer_admin_session=${token}` } };
  const res = {
    status: () => res,
    json: () => res
  };
  const next = mock.fn();
  
  await requireAdminAuth(req, res, next);
  assert.equal(next.mock.callCount(), 1);
  assert.equal(req.admin.role, "admin");
});

test("requireAdminAuth blocks invalid admin token", async () => {
  const req = { headers: {} };
  let status;
  const res = {
    status: (s) => { status = s; return res; },
    json: () => {}
  };
  await requireAdminAuth(req, res, null);
  assert.equal(status, 401);
});

test("createCsrfMiddleware handles GET and generates token", () => {
  const middleware = createCsrfMiddleware();
  const req = { headers: {}, method: "GET", url: "/" };
  let setHeaderCalled = false;
  const res = {
    getHeader: () => null,
    setHeader: (name, value) => {
      if (name === "Set-Cookie" && value.includes("blockminer_csrf=")) setHeaderCalled = true;
    },
    locals: {}
  };
  const next = mock.fn();
  middleware(req, res, next);
  assert.equal(next.mock.callCount(), 1);
  assert.ok(res.locals.csrfToken);
  assert.equal(setHeaderCalled, true);
});

test("createCsrfMiddleware blocks POST without token", () => {
  const middleware = createCsrfMiddleware();
  const req = { 
    headers: { cookie: "blockminer_csrf=token123" }, 
    method: "POST", 
    url: "/api/test" 
  };
  let statusSet;
  const res = {
    getHeader: () => null,
    setHeader: () => {},
    status: (s) => { statusSet = s; return res; },
    json: () => { return res; },
    locals: {}
  };
  const next = mock.fn();
  middleware(req, res, next);
  assert.equal(statusSet, 403);
  assert.equal(next.mock.callCount(), 0);
});
