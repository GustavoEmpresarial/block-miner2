import { getTokenFromRequest } from "../../utils/token.js";

export function registerMinerSocketHandlers({
  io,
  engine,
  verifyAccessToken,
  getUserById,
  getOrCreateMinerProfile,
  syncUserBaseHashRate,
  persistMinerProfile,
  buildPublicState
}) {
  io.on("connection", (socket) => {
    socket.on("miner:join", async ({ token } = {}, callback) => {
      try {
        const explicitToken = typeof token === "string" && token.split(".").length === 3 ? token : null;
        const requestLike = { headers: socket.request?.headers || {} };
        const authToken = explicitToken || getTokenFromRequest(requestLike);

        if (!authToken) {
          callback?.({ ok: false, message: "Sessao invalida. Faça login novamente." });
          return;
        }

        const payload = verifyAccessToken(authToken);
        const userId = Number(payload?.sub);
        if (!userId) {
          callback?.({ ok: false, message: "Sessao invalida. Faça login novamente." });
          return;
        }

        const user = await getUserById(userId);
        if (!user) {
          callback?.({ ok: false, message: "Sessão inválida. Faça login novamente." });
          return;
        }

        const profile = await getOrCreateMinerProfile(user);
        if (syncUserBaseHashRate) {
          await syncUserBaseHashRate(user.id);
        }

        const miner = engine.createOrGetMiner({
          userId: user.id,
          username: profile.username || user.name,
          walletAddress: profile.wallet_address,
          profile: {
            rigs: profile.rigs,
            base_hash_rate: profile.base_hash_rate,
            balance: profile.balance,
            lifetimeMined: profile.lifetime_mined
          }
        });

        engine.setConnected(miner.id, true);
        socket.data.minerId = miner.id;
        socket.data.userId = user.id;
        socket.join(`user:${user.id}`);

        if (buildPublicState) {
          const state = await buildPublicState(miner.id);
          callback?.({ ok: true, minerId: miner.id, state });
        } else {
          callback?.({ ok: true, minerId: miner.id, state: engine.getPublicState(miner.id) });
        }
      } catch (error) {
        callback?.({ ok: false, message: "Não foi possível carregar sua sala de mineração." });
      }
    });

    socket.on("miner:toggle", async ({ active } = {}, callback) => {
      const minerId = socket.data.minerId;
      if (!minerId) {
        callback?.({ ok: false, message: "Conecte-se primeiro." });
        return;
      }

      const miner = engine.setActive(minerId, active);
      if (persistMinerProfile && miner) {
        await persistMinerProfile(miner);
      }
      callback?.({ ok: true, state: engine.getPublicState(minerId) });
    });

    socket.on("miner:boost", (_payload, callback) => {
      const minerId = socket.data.minerId;
      if (!minerId) {
        callback?.({ ok: false, message: "Conecte-se primeiro." });
        return;
      }

      const result = engine.applyBoost(minerId);
      callback?.({ ...result, state: engine.getPublicState(minerId) });
    });

    socket.on("miner:upgrade-rig", async (_payload, callback) => {
      const minerId = socket.data.minerId;
      if (!minerId) {
        callback?.({ ok: false, message: "Conecte-se primeiro." });
        return;
      }

      const result = engine.upgradeRig(minerId);
      if (result?.ok) {
        const miner = engine.miners.get(minerId);
        if (persistMinerProfile && miner) {
          await persistMinerProfile(miner);
        }
      }
      callback?.({ ...result, state: engine.getPublicState(minerId) });
    });

    socket.on("miner:wallet-link", async ({ walletAddress } = {}, callback) => {
      const minerId = socket.data.minerId;
      if (!minerId) {
        callback?.({ ok: false, message: "Conecte-se primeiro." });
        return;
      }

      const miner = engine.setWallet(minerId, walletAddress);
      if (persistMinerProfile && miner) {
        await persistMinerProfile(miner);
      }
      callback?.({ ok: true, message: "Carteira conectada para depósito e saque.", state: engine.getPublicState(minerId) });
    });

    socket.on("disconnect", async () => {
      const minerId = socket.data.minerId;
      if (minerId) {
        const miner = engine.miners.get(minerId);
        if (persistMinerProfile && miner) {
          await persistMinerProfile(miner);
        }
        engine.setConnected(minerId, false);
      }
    });
  });
}
