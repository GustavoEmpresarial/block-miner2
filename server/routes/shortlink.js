import express from "express";
import * as shortlinkController from "../controllers/shortlinkController.js";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";

export const shortlinkRouter = express.Router();

const shortlinkLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60
});

shortlinkRouter.get("/status", requireAuth, shortlinkLimiter, shortlinkController.getShortlinkStatus);
shortlinkRouter.post("/start", requireAuth, shortlinkLimiter, shortlinkController.startShortlink);
shortlinkRouter.post("/complete-step", requireAuth, shortlinkLimiter, shortlinkController.completeShortlinkStep);
