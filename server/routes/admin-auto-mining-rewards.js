import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/admin.js";
import * as autoMiningRewardsController from "../controllers/autoMiningRewardsController.js";

export const adminAutoMiningRewardsRouter = express.Router();

const adminAuth = [requireAuth, requireAdmin];

adminAutoMiningRewardsRouter.post("/", adminAuth, autoMiningRewardsController.createRewardHandler);
adminAutoMiningRewardsRouter.get("/", adminAuth, autoMiningRewardsController.getAllRewardsHandler);
adminAutoMiningRewardsRouter.get("/active", adminAuth, autoMiningRewardsController.getActiveRewardsHandler);
adminAutoMiningRewardsRouter.get("/stats", adminAuth, autoMiningRewardsController.getRewardsStatsHandler);
adminAutoMiningRewardsRouter.get("/:reward_id", adminAuth, autoMiningRewardsController.getRewardHandler);
adminAutoMiningRewardsRouter.patch("/:reward_id", adminAuth, autoMiningRewardsController.updateRewardHandler);
adminAutoMiningRewardsRouter.post("/:reward_id/activate", adminAuth, autoMiningRewardsController.activateRewardHandler);
adminAutoMiningRewardsRouter.post("/:reward_id/deactivate", adminAuth, autoMiningRewardsController.deactivateRewardHandler);
adminAutoMiningRewardsRouter.delete("/:reward_id", adminAuth, autoMiningRewardsController.deleteRewardHandler);
