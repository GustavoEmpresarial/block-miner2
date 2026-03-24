import { test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../server/src/db/prisma.js";
import * as referralModel from "../server/models/referralModel.js";

test("referralModel.createReferral creates record", async () => {
  const original = prisma.referral.create;
  let createdData;
  prisma.referral.create = async (args) => { createdData = args.data; return { id: 1 }; };

  try {
    await referralModel.createReferral(1, 2);
    assert.equal(createdData.referrerId, 1);
    assert.equal(createdData.referredId, 2);
  } finally {
    prisma.referral.create = original;
  }
});

test("referralModel.getReferrer returns referrer", async () => {
  const original = prisma.referral.findFirst;
  prisma.referral.findFirst = async () => ({ id: 1, referrer: { id: 10 } });

  try {
    const res = await referralModel.getReferrer(2);
    assert.equal(res.referrer.id, 10);
  } finally {
    prisma.referral.findFirst = original;
  }
});

test("referralModel.listReferredUsers returns list", async () => {
  const original = prisma.referral.findMany;
  prisma.referral.findMany = async () => [{ id: 1, referred: { id: 2 } }];

  try {
    const list = await referralModel.listReferredUsers(1);
    assert.equal(list.length, 1);
    assert.equal(list[0].referred.id, 2);
  } finally {
    prisma.referral.findMany = original;
  }
});
