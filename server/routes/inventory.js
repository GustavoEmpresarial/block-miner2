import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import * as inventoryController from "../controllers/inventoryController.js";

export const inventoryRouter = express.Router();
inventoryRouter.get("/", requireAuth, inventoryController.getInventory);
inventoryRouter.post("/install", requireAuth, inventoryController.installInventoryItem);
inventoryRouter.post("/remove", requireAuth, inventoryController.removeInventoryItem);
inventoryRouter.post("/update", requireAuth, inventoryController.updateInventory);
