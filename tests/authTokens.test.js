import { test } from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = process.env.JWT_SECRET || "12345678901234567890123456789012";

import {
  signAccessToken,
  verifyAccessToken,
  createRefreshToken,
  parseRefreshToken
} from "../server/utils/authTokens.js";

test("signAccessToken and verifyAccessToken roundtrip", () => {
  const token = signAccessToken({ id: 101, name: "alice", email: "alice@example.com" });
  const payload = verifyAccessToken(token);

  assert.equal(payload.sub, "101");
  assert.equal(payload.email, "alice@example.com");
});

test("createRefreshToken and parseRefreshToken roundtrip", () => {
  const refresh = createRefreshToken();
  const parsed = parseRefreshToken(refresh.token);

  assert.ok(parsed);
  assert.equal(parsed.tokenId, refresh.tokenId);
  assert.equal(parsed.tokenHash, refresh.tokenHash);
});
