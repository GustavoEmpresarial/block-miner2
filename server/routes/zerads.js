import express from "express";
import * as zeradsController from "../controllers/zeradsController.js";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";

export const zeradsRouter = express.Router();

const linkLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });
const callbackLimiter = createRateLimiter({ windowMs: 60_000, max: 120 });

zeradsRouter.get("/ptc-link", requireAuth, linkLimiter, zeradsController.getPtcLink);
zeradsRouter.get("/callback", callbackLimiter, zeradsController.handlePtcCallback);
zeradsRouter.post("/callback", callbackLimiter, zeradsController.handlePtcCallback);
