import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import * as shopController from "../controllers/shopController.js";

export const shopRouter = express.Router();
shopRouter.get("/miners", requireAuth, shopController.listMiners);
shopRouter.post("/purchase", requireAuth, shopController.purchaseMiner);
