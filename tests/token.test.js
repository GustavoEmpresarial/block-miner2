import { test } from "node:test";
import assert from "node:assert/strict";

import { getTokenFromRequest } from "../server/utils/token.js";

test("getTokenFromRequest prioritizes access cookie over bearer header", () => {
  const req = {
    headers: {
      authorization: "Bearer invalid-local-token",
      cookie: "blockminer_access=header.payload.sig"
    }
  };

  const token = getTokenFromRequest(req);
  assert.equal(token, "header.payload.sig");
});

test("getTokenFromRequest ignores malformed bearer token", () => {
  const req = {
    headers: {
      authorization: "Bearer cookie-session"
    }
  };

  const token = getTokenFromRequest(req);
  assert.equal(token, null);
});
