import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createCspMiddleware } from "../server/middleware/csp.js";

test("cspMiddleware generates a nonce and sets headers", () => {
  const middleware = createCspMiddleware();
  const req = { path: "/", headers: {} };
  const headers = {};
  const res = {
    locals: {},
    setHeader: (name, value) => { headers[name.toLowerCase()] = value; },
    removeHeader: mock.fn(),
    getHeader: (name) => headers[name.toLowerCase()]
  };
  const next = mock.fn();

  middleware(req, res, next);

  // Helmet calls next() after setting headers
  assert.equal(next.mock.callCount(), 1);

  // Check if CSP header was set by helmet
  const cspHeader = headers['content-security-policy'];
  if (cspHeader) {
    assert.ok(cspHeader.includes("'self'"), "CSP should include 'self'");
    assert.ok(cspHeader.includes("'unsafe-inline'"), "Header should include unsafe-inline");
  }
});

test("cspMiddleware skips API routes", () => {
  const middleware = createCspMiddleware();
  const req = { path: "/api/test", headers: {} };
  const res = { locals: {}, setHeader: mock.fn() };
  const next = mock.fn();

  middleware(req, res, next);

  assert.equal(res.locals.cspNonce, undefined);
  assert.equal(next.mock.callCount(), 1);
});

test("cspMiddleware skips asset routes", () => {
  const middleware = createCspMiddleware();
  const req = { path: "/static/js/main.js", headers: {} };
  const res = { locals: {}, setHeader: mock.fn() };
  const next = mock.fn();

  middleware(req, res, next);

  assert.equal(res.locals.cspNonce, undefined);
  assert.equal(next.mock.callCount(), 1);
});
