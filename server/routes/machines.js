import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import * as machinesController from "../controllers/machinesController.js";

export const machinesRouter = express.Router();
machinesRouter.get("/", requireAuth, machinesController.listMachines);
machinesRouter.post("/toggle", requireAuth, machinesController.toggleMachine);
machinesRouter.post("/remove", requireAuth, machinesController.removeMachine);
machinesRouter.post("/move", requireAuth, machinesController.moveMachine);
