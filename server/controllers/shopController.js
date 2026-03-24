import * as inventoryModel from "../models/inventoryModel.js";
import * as minersModel from "../models/minersModel.js";
import prisma from "../src/db/prisma.js";
import { syncOnlineMinerPolBalance } from "../src/runtime/miningRuntime.js";
import { createNotification } from "./notificationController.js";
import { getMiningEngine } from "../src/miningEngineInstance.js";

const DEFAULT_MINER_IMAGE_URL = "/assets/machines/reward1.png";
/** Default on: list miners + allow POL balance purchases. Set SHOP_PURCHASES_ENABLED=false to turn off. */
const SHOP_PURCHASES_ENABLED = String(process.env.SHOP_PURCHASES_ENABLED ?? "true").toLowerCase() === "true";

export async function listMiners(req, res) {
  try {
    if (!SHOP_PURCHASES_ENABLED) {
      return res.status(503).json({
        ok: false,
        code: "SHOP_DISABLED",
        message: "Shop is temporarily disabled."
      });
    }

    const rawPage = Number(req.query?.page || 1);
    const rawPageSize = Number(req.query?.pageSize || 24);
    const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
    const pageSize = Number.isInteger(rawPageSize) ? Math.min(Math.max(rawPageSize, 6), 48) : 24;

    const { miners, total } = await minersModel.listActiveMiners(page, pageSize);
    const items = miners.map((miner) => ({
      id: miner.id,
      name: miner.name,
      baseHashRate: Number(miner.baseHashRate || 0),
      slotSize: Number(miner.slotSize || 1),
      price: Number(miner.price || 0),
      imageUrl: miner.imageUrl || DEFAULT_MINER_IMAGE_URL
    }));

    res.json({
      ok: true,
      purchasesEnabled: SHOP_PURCHASES_ENABLED,
      page,
      pageSize,
      total,
      miners: items
    });
  } catch (error) {
    console.error("Error loading miners:", error);
    res.status(500).json({ ok: false, message: "Unable to load miners." });
  }
}

export async function purchaseMiner(req, res) {
  try {
    if (!SHOP_PURCHASES_ENABLED) {
      return res.status(503).json({
        ok: false,
        code: "SHOP_PURCHASES_DISABLED",
        message: "Purchases are temporarily disabled."
      });
    }

    const minerId = Number(req.body?.minerId);
    if (!Number.isInteger(minerId) || minerId <= 0) {
      res.status(400).json({ ok: false, message: "Invalid miner ID." });
      return;
    }

    const miner = await minersModel.getActiveMinerById(minerId);
    if (!miner) {
      res.status(404).json({ ok: false, message: "Miner not found." });
      return;
    }

    const price = Number(miner.price || 0);
    const baseHashRate = Number(miner.baseHashRate || 0);
    const slotSize = Number(miner.slotSize || 1);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(baseHashRate) || baseHashRate <= 0) {
      res.status(500).json({ ok: false, message: "Miner data invalid." });
      return;
    }

    if (!Number.isInteger(slotSize) || slotSize < 1 || slotSize > 2) {
      res.status(500).json({ ok: false, message: "Miner slot size invalid." });
      return;
    }

    const now = new Date();

    let updatedUser;
    try {
      updatedUser = await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: req.user.id } });
        const pol = Number(user?.polBalance ?? 0);
        if (!user || !Number.isFinite(pol) || pol + 1e-12 < price) {
          throw new Error("Insufficient balance.");
        }

        const newUser = await tx.user.update({
          where: { id: req.user.id },
          data: { polBalance: { decrement: price } }
        });

        await tx.userInventory.create({
          data: {
            userId: req.user.id,
            minerId: miner.id,
            minerName: miner.name,
            level: 1,
            hashRate: baseHashRate,
            slotSize: slotSize,
            imageUrl: miner.imageUrl || DEFAULT_MINER_IMAGE_URL,
            acquiredAt: now,
            updatedAt: now
          }
        });

        return newUser;
      });

      syncOnlineMinerPolBalance(req.user.id, updatedUser.polBalance);

      // Create Notification
      await createNotification({
        userId: req.user.id,
        title: "Compra Realizada",
        message: `Você adquiriu ${miner.name} por ${price} POL. O equipamento já está no seu inventário!`,
        type: "success",
        io: getMiningEngine()?.io
      });

    } catch (error) {
      if (error.message === "Insufficient balance.") {
        return res.status(400).json({ ok: false, message: "Insufficient balance." });
      }
      throw error;
    }

    res.json({
      ok: true,
      message: `${miner.name} added to inventory!`,
      newBalance: Number(updatedUser?.polBalance || 0)
    });
  } catch (error) {
    console.error("Error purchasing miner:", error);
    res.status(500).json({ ok: false, message: "Purchase error." });
  }
}
