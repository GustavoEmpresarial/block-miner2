import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createCronActionRunner, sanitizeMeta } from "../server/cron/cronActionRunner.js";

test("sanitizeMeta handles different types", () => {
  const input = {
    a: 1,
    b: "short",
    c: "long".repeat(100),
    d: [1, "test", { complex: 1 }],
    e: { nested: 1 },
    f: null,
    g: undefined,
    h: [null, 123, "string", true, { obj: 1 }]
  };
  const sanitized = sanitizeMeta(input);
  assert.equal(sanitized.a, 1);
  assert.equal(sanitized.b, "short");
  assert.ok(sanitized.c.endsWith("..."));
  assert.equal(sanitized.d[2], "[complex-item]");
  assert.equal(sanitized.e, "[complex]");
  assert.equal(sanitized.f, null);
  assert.equal(sanitized.g, undefined);
  assert.equal(sanitized.h[4], "[complex-item]");
});

test("cronActionRunner executes successfully", async () => {
  const logger = {
    info: mock.fn(),
    warn: mock.fn(),
    error: mock.fn()
  };
  const runner = createCronActionRunner({ logger, cronName: "TestCron" });
  
  const execute = mock.fn(async () => "done");
  const result = await runner({
    action: "test_action",
    execute
  });

  assert.equal(result.ok, true);
  assert.equal(result.result, "done");
  assert.equal(execute.mock.callCount(), 1);
});

test("cronActionRunner handles validation failure", async () => {
  const logger = {
    info: mock.fn(),
    warn: mock.fn(),
    error: mock.fn()
  };
  const runner = createCronActionRunner({ logger, cronName: "TestCron" });
  
  const result = await runner({
    action: "test_action",
    validate: async () => ({ ok: false, reason: "invalid" }),
    execute: async () => "should not run"
  });

  assert.equal(result.ok, false);
  assert.equal(result.stage, "validate");
  assert.equal(result.reason, "invalid");
});

test("cronActionRunner prevents concurrent execution", async () => {
  const logger = {
    info: mock.fn(),
    warn: mock.fn(),
    error: mock.fn()
  };
  const runner = createCronActionRunner({ logger, cronName: "TestCron" });
  
  let resolveExecute;
  const executePromise = new Promise(r => { resolveExecute = r; });
  
  // First run
  const run1 = runner({
    action: "concurrent_action",
    execute: () => executePromise
  });

  // Second run (should be skipped)
  const run2 = await runner({
    action: "concurrent_action",
    execute: () => "done"
  });

  assert.equal(run2.ok, false);
  assert.equal(run2.reason, "already_running");

  resolveExecute("done");
  await run1;
});

test("cronActionRunner handles prepare error", async () => {
  const logger = { error: mock.fn(), info: mock.fn() };
  const runner = createCronActionRunner({ logger, cronName: "Test" });
  const result = await runner({
    action: "fail",
    prepare: () => { throw new Error("prepare_fail"); }
  });
  assert.equal(result.ok, false);
  assert.equal(result.stage, "prepare");
});

test("cronActionRunner handles execute error", async () => {
  const logger = { error: mock.fn(), info: mock.fn() };
  const runner = createCronActionRunner({ logger, cronName: "Test" });
  const result = await runner({
    action: "fail",
    execute: () => { throw new Error("execute_fail"); }
  });
  assert.equal(result.ok, false);
  assert.equal(result.stage, "execute");
});

test("cronActionRunner handles confirm rejection", async () => {
  const logger = { info: mock.fn(), warn: mock.fn() };
  const runner = createCronActionRunner({ logger, cronName: "Test" });
  const result = await runner({
    action: "fail",
    confirm: () => ({ ok: false, reason: "not_confirmed" })
  });
  assert.equal(result.ok, false);
  assert.equal(result.stage, "confirm");
});

test("cronActionRunner handles stage catch blocks", async () => {
  const logger = { error: mock.fn(), info: mock.fn() };
  const runner = createCronActionRunner({ logger, cronName: "Test" });

  // Validate catch
  const res1 = await runner({
    action: "v_fail",
    validate: () => { throw new Error("v_err"); }
  });
  assert.equal(res1.stage, "validate");

  // Sanitize catch
  const res2 = await runner({
    action: "s_fail",
    sanitize: () => { throw new Error("s_err"); }
  });
  assert.equal(res2.stage, "sanitize");

  // Confirm catch
  const res3 = await runner({
    action: "c_fail",
    confirm: () => { throw new Error("c_err"); }
  });
  assert.equal(res3.stage, "confirm");
});

test("cronActionRunner normalization and helpers", async () => {
  const logger = {
    info: mock.fn(),
    warn: mock.fn(),
    error: mock.fn(),
    debug: mock.fn()
  };
  const runner = createCronActionRunner({ logger, cronName: "Test" });

  // Boolean validation
  const res1 = await runner({ action: "bool", validate: () => false });
  assert.equal(res1.ok, false);

  // Object validation without ok: false
  const res2 = await runner({ action: "obj", validate: () => ({}) });
  assert.equal(res2.ok, true);

  // Boolean confirm
  const res3 = await runner({ action: "bool_c", confirm: () => false });
  assert.equal(res3.ok, false);

  // Object confirm without ok: false
  const res4 = await runner({ action: "obj_c", confirm: () => ({}) });
  assert.equal(res4.ok, true);

  // writeWithLevel fallback to warn
  await runner({ 
    action: "fallback", 
    validate: () => ({ ok: false }),
    validateFailureLogLevel: "invalid_level" 
  });
  assert.ok(logger.warn.mock.callCount() > 0);
});

