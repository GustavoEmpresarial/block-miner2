import express from "express";
import * as walletController from "../controllers/walletController.js";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";

const walletRouter = express.Router();
const walletLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

walletRouter.get("/balance", requireAuth, walletLimiter, walletController.getBalance);
walletRouter.get("/transactions", requireAuth, walletLimiter, walletController.getTransactions);
walletRouter.post("/deposit", requireAuth, walletLimiter, walletController.requestDeposit);
walletRouter.post("/resync-deposits", requireAuth, walletLimiter, walletController.resyncDeposits);
walletRouter.post("/update-address", requireAuth, walletLimiter, walletController.updateAddress);
walletRouter.post("/withdraw", requireAuth, walletLimiter, walletController.requestWithdrawal);

export { walletRouter };
