import "./loadEnv.js";
import "./assertProductionEnv.js";
import path from "path";
import fs from "fs/promises";
import http from "http";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { Server } from "socket.io";

import prisma from "./src/db/prisma.js";
import { MiningEngine } from "./src/miningEngine.js";
import { setMiningEngine } from "./src/miningEngineInstance.js";
import loggerLib from "./utils/logger.js";
import { getValidatedDepositAddress } from "./utils/depositAddress.js";

// Middlewares
import { createRateLimiter } from "./middleware/rateLimit.js";
import { createCspMiddleware } from "./middleware/csp.js";
// CSRF middleware desativado para permitir API access
// import { createCsrfMiddleware } from "./middleware/csrf.js";

// Routes
import { authRouter } from "./routes/auth.js";
import { faucetRouter } from "./routes/faucet.js";
import { walletRouter } from "./routes/wallet.js";
import { shopRouter } from "./routes/shop.js";
import { inventoryRouter } from "./routes/inventory.js";
import { machinesRouter } from "./routes/machines.js";
import { racksRouter } from "./routes/racks.js";
import { checkinRouter } from "./routes/checkin.js";
import { chatRouter } from "./routes/chat.js";
import { rankingRouter } from "./routes/ranking.js";
import { shortlinkRouter } from "./routes/shortlink.js";
import { zeradsRouter } from "./routes/zerads.js";
import { offerwallRouter } from "./routes/offerwall.js";
import { youtubeRouter } from "./routes/youtube.js";
import { autoMiningGpuRouter } from "./routes/auto-mining-gpu.js";
import { sessionRouter } from "./routes/session.js";
import { notificationRouter } from "./routes/notification.js";
import { swapRouter } from "./routes/swap.js";
import { ptpRouter } from "./routes/ptp.js";
import { adminAuthRouter } from "./routes/admin-auth.js";
import { adminAutoMiningRewardsRouter } from "./routes/admin-auto-mining-rewards.js";
import supportRouter from "./routes/support.js";
import userRouter from "./routes/user.js";
import * as healthController from "./controllers/healthController.js";

// Models & Utils
import { startCronTasks } from "./cron/index.js";
import { registerMinerSocketHandlers } from "./src/socket/registerMinerSocketHandlers.js";
import { registerGamesSocketHandlers } from "./src/socket/registerGamesSocketHandlers.js";
import serverDatabaseModel from "./models/database/serverDatabaseModel.js";
import { getUserById } from "./models/userModel.js";
import { verifyAccessToken } from "./utils/authTokens.js";
import { getOrCreateMinerProfile, persistMinerProfile, syncUserBaseHashRate } from "./models/minerProfileModel.js";
import { ensureDefaultInternalReward } from "./models/shortlinkRewardModel.js";

const logger = loggerLib.child("Server");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",") : "*",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// 1. Initialize Mining Engine
const engine = new MiningEngine();
setMiningEngine(engine);
engine.setIo(io);

// 1.1 Preload historical blocks into memory
const bootstrapEngine = async () => {
  try {
    const blocks = await serverDatabaseModel.loadRecentBlocks(12);
    if (blocks && blocks.length > 0) {
      engine.blockHistory = blocks.map(b => ({
        blockNumber: b.blockNumber,
        reward: b.reward,
        minerCount: b.minerCount,
        timestamp: b.timestamp,
        userRewards: b.userRewards
      }));
    }

    const [maxDist, maxLog] = await Promise.all([
      prisma.blockDistribution.aggregate({ _max: { blockNumber: true } }),
      prisma.miningRewardsLog.aggregate({ _max: { blockNumber: true } })
    ]);

    const currentMax = Math.max(maxDist._max.blockNumber || 0, maxLog._max.blockNumber || 0);
    engine.blockNumber = currentMax + 1;

    logger.info(`Engine bootstrap complete. Current Block: #${currentMax}. Next: #${engine.blockNumber}`);
    
    // 1.2 Sync miners after block initialization
    await syncEngineMiners(engine);
  } catch (err) {
    logger.error("Failed to bootstrap mining engine", { error: err.message });
  }
};

bootstrapEngine();

engine.setProfileLoader(async (userId) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user) return getOrCreateMinerProfile(user);
  return null;
});

// 1.2 Function to sync all active users with the engine
async function syncEngineMiners(engine) {
  try {
    const users = await prisma.user.findMany({
      where: { isBanned: false }
    });
    
    logger.info(`Syncing ${users.length} users into mining engine...`);
    
    for (const user of users) {
      const profile = await getOrCreateMinerProfile(user);
      if (profile && profile.base_hash_rate > 0) {
        engine.createOrGetMiner({
          userId: user.id,
          username: profile.username || user.name,
          walletAddress: profile.wallet_address,
          profile: {
            rigs: profile.rigs,
            base_hash_rate: profile.base_hash_rate,
            balance: profile.balance,
            lifetimeMined: profile.lifetime_mined,
            refCode: profile.refCode,
            referralCount: profile.referralCount
          }
        });
      }
    }
    logger.info("Engine sync complete.");
  } catch (error) {
    logger.error("Failed to sync engine miners", { error: error.message });
  }
}

// 2. Setup Database Persistence for the Engine
engine.setPersistBlockRewardsCallback(async (payload) => {
  try {
    await serverDatabaseModel.persistBlockRewards(payload);
  } catch (error) {
    logger.error("Engine persistence error", { error: error.message });
    throw error;
  }
});

// 3. Register Socket Handlers
registerMinerSocketHandlers({
  io,
  engine,
  verifyAccessToken,
  getUserById,
  getOrCreateMinerProfile,
  syncUserBaseHashRate,
  persistMinerProfile,
  buildPublicState: async (minerId) => engine.getPublicState(minerId)
});

registerGamesSocketHandlers({
  io,
  engine
});

// 4. Global Security Stack
app.use(helmet({ 
  contentSecurityPolicy: false,
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
}));
app.use(createCspMiddleware());
app.use(cors({
  origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",") : "*",
  credentials: true
}));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
// app.use(createCsrfMiddleware());

// Global Rate Limiter
const globalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5000, // Increased from 2000 to 5000
  skip: (req) => {
    const skipPaths = ["/api/session/heartbeat", "/api/wallet/balance", "/api/checkin/status"];
    return skipPaths.includes(req.originalUrl);
  },
  message: "Too many requests from this IP, please try again later."
});
app.use("/api", globalLimiter);

app.use("/api", (req, res, next) => {
  logger.info(`INCOMING API REQUEST: ${req.method} ${req.originalUrl}`);
  next();
});

// 5. API Routes
import * as zeradsController from "./controllers/zeradsController.js";
app.get("/zeradsptc.php", zeradsController.handlePtcCallback);
app.post("/zeradsptc.php", zeradsController.handlePtcCallback);

app.use("/api/auth", authRouter);
app.use("/api/faucet", faucetRouter);
app.use("/api/wallet", walletRouter);
app.use("/api/shop", shopRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/machines", machinesRouter);
app.use("/api/racks", racksRouter);
app.use("/api/checkin", checkinRouter);
app.use("/api/chat", chatRouter);
app.use("/api/ranking", rankingRouter);
app.use("/api/shortlink", shortlinkRouter);
app.use("/api/zerads", zeradsRouter);
app.use("/api/offerwall", offerwallRouter);
app.use("/api/youtube", youtubeRouter);
app.use("/api/auto-mining-gpu", autoMiningGpuRouter);
app.use("/api/session", sessionRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/swap", swapRouter);
app.use("/api/support", supportRouter);
app.use("/api/user", userRouter);
// app.use("/api/ptp", ptpRouter);

// 6. Admin Routes
import { adminRouter } from "./routes/admin.js";
app.use("/api/admin/auth", adminAuthRouter);
app.use("/api/admin", adminRouter);
app.use("/api/admin/auto-mining-rewards", adminAutoMiningRewardsRouter);

// Health check
app.get("/health", healthController.health);

// 7. Static Assets & Frontend Production Build
// Serve user-uploaded miner images from the persistent volume (survives rebuilds)
app.use('/uploads', express.static('/app/uploads'));

const publicPath = path.join(__dirname, "..", "client", "dist");
app.use(express.static(publicPath, { index: false })); // Don't serve index.html statically automatically

// Express 5 / path-to-regexp 8+ catch-all syntax
app.get("/{*all}", async (req, res) => {
  try {
    const indexPath = path.join(publicPath, "index.html");
    let html = await fs.readFile(indexPath, "utf8");
    
    // Inject the nonce into all script and style tags that have the placeholder
    const nonce = res.locals.cspNonce || "";
    html = html.replace(/__CSP_NONCE__/g, nonce);
    
    res.send(html);
  } catch (error) {
    logger.error("Error serving index.html", { error: error.message });
    res.status(500).send("Internal Server Error");
  }
});

// 8. Bootstrap
async function bootstrap() {
  try {
      const port = process.env.PORT || 3000;
      const host = process.env.HOST || '0.0.0.0';
    // Ensure shortlink reward is correctly set up
    await ensureDefaultInternalReward().catch(err => logger.error("Failed to ensure shortlink reward", { error: err.message }));

    // --- ONE-TIME SCRIPT: Reset all shortlinks on startup ---
    try {
      logger.info("Running one-time shortlink reset for all users...");
      const { count } = await prisma.shortlinkCompletion.updateMany({
        where: { dailyRuns: { gt: 0 } },
        data: { dailyRuns: 0, resetAt: new Date() }
      });
      logger.info(`One-time reset completed for ${count} users.`);
    } catch (e) {
      logger.error("One-time shortlink reset failed", { error: e.message });
    }
    // --- END ONE-TIME SCRIPT ---

    // Inventário permanente (faucet + auto mining): limpa expires_at legado.
    try {
      const faucetMiners = await prisma.miner.findMany({
        where: { slug: { in: ["faucet-micro-miner"] } },
        select: { id: true }
      });
      const ids = faucetMiners.map((m) => m.id);
      let cleared = 0;
      if (ids.length > 0) {
        const u = await prisma.userInventory.updateMany({
          where: { minerId: { in: ids }, expiresAt: { not: null } },
          data: { expiresAt: null }
        });
        cleared += u.count;
      }
      const u2 = await prisma.userInventory.updateMany({
        where: {
          minerName: "Pulse Mini v1",
          expiresAt: { not: null }
        },
        data: { expiresAt: null }
      });
      cleared += u2.count;
      const rewardNames = await prisma.autoMiningReward.findMany({
        select: { name: true }
      });
      const autoMiningNames = rewardNames
        .map((r) => String(r.name || "").trim())
        .filter(Boolean);
      if (autoMiningNames.length > 0) {
        const u3 = await prisma.userInventory.updateMany({
          where: {
            minerName: { in: autoMiningNames },
            expiresAt: { not: null }
          },
          data: { expiresAt: null }
        });
        cleared += u3.count;
      }
      const u4 = await prisma.userInventory.updateMany({
        where: {
          OR: [
            { minerName: "Pulse GPU v1" },
            { minerName: { startsWith: "GPU " } }
          ],
          expiresAt: { not: null }
        },
        data: { expiresAt: null }
      });
      cleared += u4.count;
      if (cleared > 0) {
        logger.info(`Permanent inventory: cleared expiresAt on ${cleared} row(s).`);
      }
    } catch (e) {
      logger.error("Permanent inventory expires cleanup failed", { error: e.message });
    }

    server.listen(port, host, () => {
      logger.info(`Server running on ${host}:${port}`);

      const dep = getValidatedDepositAddress();
      if (!dep.address) {
        logger.warn(
          "POL deposit disabled: DEPOSIT_WALLET_ADDRESS / CHECKIN_RECEIVER missing or not a valid 0x address — wallet deposit UI will stay empty."
        );
      }

      // Start background tasks
      startCronTasks({
        engine,
        io,
        persistMinerProfile,
        syncUserBaseHashRate,
        buildPublicState: async (minerId) => engine.getPublicState(minerId)
      });
    });
  } catch (error) {
    logger.error("Bootstrap failed", { error: error.message });
    process.exit(1);
  }
}

bootstrap();
