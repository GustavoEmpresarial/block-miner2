import express from "express";
import * as chatController from "../controllers/chatController.js";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";

export const chatRouter = express.Router();

const chatLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });

chatRouter.get("/messages", requireAuth, chatController.getMessages);
chatRouter.post("/send", requireAuth, chatLimiter, chatController.sendMessage);
