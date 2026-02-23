const express = require("express");
const router = express.Router();
const shortlinkController = require("../controllers/shortlinkController");
const { requireAuth } = require("../middleware/auth");
const { createRateLimiter } = require("../middleware/rateLimit");

const shortlinkLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10
});

// Get shortlink status
router.get("/status", requireAuth, shortlinkLimiter, shortlinkController.getShortlinkStatus);

// Complete shortlink step
router.post("/complete-step", requireAuth, shortlinkLimiter, shortlinkController.completeShortlinkStep);

module.exports = router;
