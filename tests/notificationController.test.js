import { test, mock } from "node:test";
import assert from "node:assert/strict";
import prisma from "../server/src/db/prisma.js";
import * as notificationController from "../server/controllers/notificationController.js";

test("getNotifications returns user notifications", async () => {
  const original = prisma.notification.findMany;
  prisma.notification.findMany = async () => [{ id: 1, title: "Test" }];

  try {
    const req = { user: { id: 1 } };
    let jsonResult;
    const res = {
      status: (s) => res,
      json: (data) => { jsonResult = data; }
    };

    await notificationController.getNotifications(req, res);
    assert.equal(jsonResult.ok, true);
    assert.equal(jsonResult.notifications.length, 1);
  } finally {
    prisma.notification.findMany = original;
  }
});

test("markAsRead updates notification status", async () => {
  const originalUpdate = prisma.notification.update;
  const originalUpdateMany = prisma.notification.updateMany;
  
  let updateCalled = false;
  prisma.notification.update = async () => { updateCalled = true; return {}; };
  prisma.notification.updateMany = async () => { updateCalled = true; return {}; };

  try {
    const req = { user: { id: 1 }, params: { id: "1" } };
    const res = { json: () => {} };
    await notificationController.markAsRead(req, res);
    assert.equal(updateCalled, true);
    
    updateCalled = false;
    const reqAll = { user: { id: 1 }, params: { id: "all" } };
    await notificationController.markAsRead(reqAll, res);
    assert.equal(updateCalled, true);
  } finally {
    prisma.notification.update = originalUpdate;
    prisma.notification.updateMany = originalUpdateMany;
  }
});

test("createNotification creates and emits", async () => {
  const originalCreate = prisma.notification.create;
  let createdData;
  prisma.notification.create = async ({ data }) => { createdData = data; return { ...data, id: 1 }; };

  let emitCalled = false;
  const mockIo = {
    to: (room) => ({
      emit: (event, data) => { emitCalled = true; }
    })
  };

  try {
    const result = await notificationController.createNotification({
      userId: 1,
      title: "Title",
      message: "Message",
      type: "info",
      io: mockIo
    });

    assert.equal(createdData.userId, 1);
    assert.equal(emitCalled, true);
    assert.equal(result.id, 1);

    // Test without io
    emitCalled = false;
    await notificationController.createNotification({ userId: 1, title: "NoIO", message: "NoIO" });
    assert.equal(emitCalled, false);

    // Test catch block
    prisma.notification.create = async () => { throw new Error("DB Error"); };
    const resCatch = await notificationController.createNotification({ userId: 1, title: "Fail", message: "Fail" });
    assert.equal(resCatch, undefined);

  } finally {
    prisma.notification.create = originalCreate;
  }
});

test("getNotifications catch block", async () => {
  const original = prisma.notification.findMany;
  prisma.notification.findMany = async () => { throw new Error("DB Error"); };

  try {
    const req = { user: { id: 1 } };
    let status;
    const res = {
      status: (s) => { status = s; return res; },
      json: () => {}
    };

    await notificationController.getNotifications(req, res);
    assert.equal(status, 500);
  } finally {
    prisma.notification.findMany = original;
  }
});

test("markAsRead catch block", async () => {
  const originalUpdate = prisma.notification.update;
  prisma.notification.update = async () => { throw new Error("Update Error"); };

  try {
    const req = { user: { id: 1 }, params: { id: "1" } };
    let status;
    const res = {
      status: (s) => { status = s; return res; },
      json: () => {}
    };

    await notificationController.markAsRead(req, res);
    assert.equal(status, 500);
  } finally {
    prisma.notification.update = originalUpdate;
  }
});

