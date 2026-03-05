import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import * as checkinController from "../controllers/checkinController.js";

export const checkinRouter = express.Router();
checkinRouter.get("/status", requireAuth, checkinController.getStatus);
checkinRouter.post("/confirm", requireAuth, checkinController.confirmCheckin);
