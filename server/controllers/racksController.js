import * as rackModel from "../models/rackModel.js";

const RACK_NAME_REGEX = /^[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 -]*$/;

export async function listRacks(req, res) {
  try {
    const racks = await rackModel.listRacks(req.user.id);
    res.json({ ok: true, racks });
  } catch (error) {
    console.error("Error loading racks:", error);
    res.status(500).json({ ok: false, message: "Unable to load racks." });
  }
}

export async function updateRack(req, res) {
  try {
    const rackIndex = Number(req.body?.rackIndex);
    const customName = String(req.body?.customName || "").trim();

    if (!Number.isInteger(rackIndex) || rackIndex < 1) {
      res.status(400).json({ ok: false, message: "Invalid rack index." });
      return;
    }

    if (!customName || customName.length > 30 || !RACK_NAME_REGEX.test(customName)) {
      res.status(400).json({ ok: false, message: "Invalid rack name." });
      return;
    }

    await rackModel.upsertRackName(req.user.id, rackIndex, customName);
    res.json({ ok: true, message: "Rack name updated successfully." });
  } catch (error) {
    console.error("Error updating rack:", error);
    res.status(500).json({ ok: false, message: "Unable to update rack." });
  }
}
