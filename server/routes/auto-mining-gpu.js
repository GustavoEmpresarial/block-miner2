import express from "express";
import * as autoMiningGpuController from "../controllers/autoMiningGpuController.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/admin.js";

export const autoMiningGpuRouter = express.Router();

autoMiningGpuRouter.get("/available", requireAuth, autoMiningGpuController.getAvailableGPUsHandler);
autoMiningGpuRouter.post("/claim", requireAuth, autoMiningGpuController.claimGPUHandler);
autoMiningGpuRouter.get("/history", requireAuth, autoMiningGpuController.getGPUHistoryHandler);
autoMiningGpuRouter.get("/active-reward", requireAuth, autoMiningGpuController.getActiveRewardHandler);
