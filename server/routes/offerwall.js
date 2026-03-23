import express from "express";
import { offerwallMePostback } from "../controllers/offerwallController.js";

export const offerwallRouter = express.Router();

// The postback URL will be /api/offerwall/postback
// It supports both GET and POST requests
offerwallRouter.get("/postback", offerwallMePostback);
offerwallRouter.post("/postback", offerwallMePostback);
