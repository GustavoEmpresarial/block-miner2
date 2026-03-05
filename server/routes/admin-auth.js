import express from "express";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { login } from "../controllers/adminAuthController.js";

export const adminAuthRouter = express.Router();

// Rate limiting for login (5 attempts per 15 minutes)
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Many login attempts. Try again in 15 minutes."
});

// POST /api/admin/login - Authenticate
adminAuthRouter.post("/login", loginLimiter, login);
