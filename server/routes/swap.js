import express from "express";
import { z } from "zod";
import * as swapController from "../controllers/swapController.js";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { validateBody } from "../middleware/validate.js";

export const swapRouter = express.Router();

const swapLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });

const swapSchema = z
	.object({
		fromAsset: z.string().trim().min(2).max(8),
		toAsset: z.string().trim().min(2).max(8),
		amount: z.union([z.string().trim(), z.number()])
	})
	.strict();

swapRouter.get("/balances", requireAuth, swapLimiter, swapController.getBalances);
swapRouter.post("/execute", requireAuth, swapLimiter, validateBody(swapSchema), swapController.executeSwap);
