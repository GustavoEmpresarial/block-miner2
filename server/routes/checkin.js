import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import * as checkinController from "../controllers/checkinController.js";

const checkinConfirmLimiter = createRateLimiter({ windowMs: 60_000, max: 15 });

export const checkinRouter = express.Router();
checkinRouter.get("/status", requireAuth, checkinController.getStatus);
checkinRouter.post(
  "/confirm",
  requireAuth,
  checkinConfirmLimiter,
  checkinController.confirmCheckin
);
