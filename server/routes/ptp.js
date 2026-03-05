import express from "express";
import { z } from "zod";
import * as ptpController from "../controllers/ptpController.js";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { validateBody } from "../middleware/validate.js";

export const ptpRouter = express.Router();

const ptpLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });
const ptpWriteLimiter = createRateLimiter({ windowMs: 60_000, max: 12 });

const createAdSchema = z
	.object({
		title: z.string().trim().min(2).max(80),
		url: z.string().trim().url().max(220),
		views: z.union([z.number(), z.string()]).optional()
	})
	.strict();

const trackViewSchema = z
	.object({
		adId: z.union([z.number(), z.string()]),
		viewerHash: z.string().trim().min(6).max(64),
		promoterId: z.union([z.number(), z.string()]).optional()
	})
	.strict();

ptpRouter.post("/create-ad", requireAuth, ptpWriteLimiter, validateBody(createAdSchema), ptpController.createAd);
ptpRouter.get("/my-ads", requireAuth, ptpLimiter, ptpController.getMyAds);
ptpRouter.post("/track-view", ptpWriteLimiter, validateBody(trackViewSchema), ptpController.trackView);
