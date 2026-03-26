import { test } from "node:test";
import assert from "node:assert/strict";
import { wakeUpScanner } from "../server/cron/depositsCron.js";

test("wakeUpScanner does not throw", () => {
  assert.doesNotThrow(() => wakeUpScanner());
});
