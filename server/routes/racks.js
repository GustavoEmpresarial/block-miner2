import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import * as racksController from "../controllers/racksController.js";

export const racksRouter = express.Router();
racksRouter.get("/", requireAuth, racksController.listRacks);
racksRouter.post("/update", requireAuth, racksController.updateRack);
