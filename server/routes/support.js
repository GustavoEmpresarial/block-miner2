import express from "express";
import * as supportController from "../controllers/supportController.js";
import { requireAuth, authenticateTokenOptional } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";

const supportRouter = express.Router();

const supportLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5, // Limit contact requests to 5 per 15 minutes
});

supportRouter.post("/", supportLimiter, authenticateTokenOptional, supportController.createMessage);
supportRouter.get("/", requireAuth, supportController.listMessages);
// Public helpers for the mini chat before login (email-based)
supportRouter.get("/public/by-email", supportLimiter, supportController.publicListMessagesByEmail);
supportRouter.get("/public/:id", supportLimiter, supportController.publicGetMessage);
supportRouter.post("/public/:id/reply", supportLimiter, supportController.publicReplyToMessage);

supportRouter.get("/:id", requireAuth, supportController.getMessage);
supportRouter.post("/:id/reply", supportLimiter, requireAuth, supportController.replyToMessage);

export default supportRouter;
