import express from "express";
import * as faucetController from "../controllers/faucetController.js";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";

const faucetRouter = express.Router();
const faucetLimiter = createRateLimiter({ windowMs: 60_000, max: 20 });
const faucetClaimLimiter = createRateLimiter({ windowMs: 60_000, max: 6 });

faucetRouter.get("/status", requireAuth, faucetLimiter, faucetController.getStatus);
faucetRouter.post("/partner/start", requireAuth, faucetLimiter, faucetController.startPartnerVisit);
faucetRouter.post("/claim", requireAuth, faucetClaimLimiter, faucetController.claim);

export { faucetRouter };
