import { verifyMessage } from "ethers";
import walletModel from "../models/walletModel.js";
import loggerLib from "../utils/logger.js";
import { getValidatedDepositAddress } from "../utils/depositAddress.js";

const logger = loggerLib.child("WalletController");
const POLYGONSCAN_API_BASE = "https://api.etherscan.io/v2/api";
const BLOCKSCOUT_API_BASES = [
  "https://polygon.blockscout.com/api",
  "https://worldchain-mainnet.explorer.alchemy.com/api"
];

function normalizeExplorerTx(tx) {
  if (!tx || typeof tx !== "object") return null;
  const hash = String(tx.hash || tx.transactionHash || "").trim();
  if (!hash) return null;
  return {
    hash,
    from: String(tx.from || "").toLowerCase(),
    to: String(tx.to || "").toLowerCase(),
    value: String(tx.value || "0"),
    timeStamp: String(tx.timeStamp || tx.timestamp || "0"),
    isError: String(tx.isError || "0")
  };
}

async function fetchRecentWalletTxs(address) {
  const apiKey = String(
    process.env.POLYGONSCAN_API_KEY ||
    process.env.ETHERSCAN_API_KEY ||
    ""
  ).trim();

  const apiKeyParam = apiKey ? `&apikey=${encodeURIComponent(apiKey)}` : "";
  const url = `${POLYGONSCAN_API_BASE}?chainid=137&module=account&action=txlist&address=${encodeURIComponent(address)}&startblock=0&endblock=99999999&sort=desc${apiKeyParam}`;
  try {
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      const messageText = String(data?.result || data?.message || "");
      if (messageText.toLowerCase().includes("missing/invalid api key")) {
        throw new Error("missing_api_key");
      }
      if (String(data?.status) !== "1" && String(data?.message || "").toUpperCase() !== "NO TRANSACTIONS FOUND") {
        throw new Error(data?.result || data?.message || "Polygonscan response error");
      }
      return (Array.isArray(data?.result) ? data.result : [])
        .map(normalizeExplorerTx)
        .filter(Boolean);
    }
  } catch (err) {
    logger.warn("Polygonscan txlist failed, trying blockscout fallback", {
      address,
      error: String(err?.message || err)
    });
  }

  for (const base of BLOCKSCOUT_API_BASES) {
    const fallbackUrl = `${base}?module=account&action=txlist&address=${encodeURIComponent(address)}&startblock=0&endblock=99999999&sort=desc`;
    try {
      const resp = await fetch(fallbackUrl);
      if (!resp.ok) continue;
      const data = await resp.json();
      const msg = String(data?.message || "").toUpperCase();
      if (String(data?.status) !== "1" && msg !== "NO TRANSACTIONS FOUND") continue;
      return (Array.isArray(data?.result) ? data.result : [])
        .map(normalizeExplorerTx)
        .filter(Boolean);
    } catch (err) {
      logger.warn("Blockscout fallback failed", {
        endpoint: base,
        address,
        error: String(err?.message || err)
      });
    }
  }

  throw new Error("Unable to query explorer transactions (configure POLYGONSCAN_API_KEY or check explorer availability).");
}

export async function getBalance(req, res) {
  try {
    const balance = await walletModel.getUserBalance(req.user.id);
    const { address: depositAddress, reason: depositReason } = getValidatedDepositAddress();
    if (depositReason && depositReason !== "missing") {
      logger.warn("Deposit env present but invalid address", { reason: depositReason });
    }
    res.json({
      ok: true,
      ...balance,
      depositAddress,
      depositConfigured: Boolean(depositAddress)
    });
  } catch (error) {
    logger.error("Error getting balance", { error: error.message });
    res.status(500).json({ ok: false, message: "Unable to get balance." });
  }
}

export async function getTransactions(req, res) {
  try {
    const transactions = await walletModel.getTransactions(req.user.id);
    res.json({ ok: true, transactions });
  } catch (error) {
    logger.error("Error getting transactions", { error: error.message });
    res.status(500).json({ ok: false, message: "Unable to get transactions." });
  }
}

export async function requestDeposit(req, res) {
  try {
    const { amount, txHash } = req.body;
    if (!amount || !txHash) {
      return res.status(400).json({ ok: false, message: "Amount and TX Hash required." });
    }
    await walletModel.createDepositRequest(req.user.id, amount, txHash);
    res.json({ ok: true, message: "Deposit completed and confirmed." });
  } catch (error) {
    logger.error("Error requesting deposit", { error: error.message });
    res.status(400).json({ ok: false, message: error.message || "Unable to complete deposit." });
  }
}

export async function updateAddress(req, res) {
  try {
    const { walletAddress, signature } = req.body;
    if (!walletAddress || !signature) {
      return res.status(400).json({ ok: false, message: "Wallet address and signature are required." });
    }

    // Verify signature to prevent fraud/spoofing
    const message = `Verify wallet ownership for Block Miner: ${walletAddress}`;
    const recoveredAddress = verifyMessage(message, signature);

    if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      return res.status(401).json({ ok: false, message: "Invalid wallet signature. Ownership not verified." });
    }

    await walletModel.saveWalletAddress(req.user.id, walletAddress);
    res.json({ ok: true, message: "Wallet verified and linked successfully." });
  } catch (error) {
    logger.error("Error updating address", { error: error.message });
    res.status(500).json({ ok: false, message: "Unable to verify wallet address." });
  }
}

export async function requestWithdrawal(req, res) {
  try {
    const { amount, address } = req.body;
    if (!amount || !address) {
      return res.status(400).json({ ok: false, message: "Amount and address are required." });
    }
    const transaction = await walletModel.createWithdrawal(req.user.id, amount, address);
    res.json({ ok: true, message: "Withdrawal request created and pending processing.", transaction });
  } catch (error) {
    logger.error("Error requesting withdrawal", { error: error.message });
    if (error.message === "Pending withdrawal exists") {
      return res.status(409).json({ ok: false, message: error.message });
    }
    res.status(400).json({ ok: false, message: error.message || "Unable to request withdrawal." });
  }
}

export async function resyncDeposits(req, res) {
  try {
    const days = Math.min(Math.max(Number(req.body?.days || 30), 1), 365);
    const validated = getValidatedDepositAddress();
    const depositAddress = String(validated.address || "").trim().toLowerCase();
    if (!depositAddress) {
      return res.status(400).json({ ok: false, message: "Deposit wallet not configured." });
    }

    const balance = await walletModel.getUserBalance(req.user.id);
    const walletAddress = String(balance?.walletAddress || "").trim().toLowerCase();
    if (!walletAddress) {
      return res.status(400).json({
        ok: false,
        message: "No wallet linked. Connect your wallet first."
      });
    }

    const txs = await fetchRecentWalletTxs(walletAddress);
    const minTs = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
    const candidates = txs.filter((tx) => {
      const to = String(tx?.to || "").toLowerCase();
      const from = String(tx?.from || "").toLowerCase();
      const isOk = String(tx?.isError || "0") !== "1";
      const ts = Number(tx?.timeStamp || 0);
      return isOk && ts >= minTs && from === walletAddress && to === depositAddress;
    });

    let credited = 0;
    let skipped = 0;
    for (const tx of candidates) {
      const amount = Number(tx?.value || 0) / 1e18;
      if (!Number.isFinite(amount) || amount <= 0) {
        skipped += 1;
        continue;
      }
      try {
        await walletModel.createDepositRequest(req.user.id, amount, tx.hash);
        credited += 1;
      } catch (err) {
        const message = String(err?.message || "");
        if (message.includes("already used")) {
          skipped += 1;
          continue;
        }
        logger.warn("Resync deposit skipped", { userId: req.user.id, txHash: tx.hash, error: message });
        skipped += 1;
      }
    }

    return res.json({
      ok: true,
      message: "Deposit resync finished.",
      scanned: candidates.length,
      credited,
      skipped,
      days
    });
  } catch (error) {
    logger.error("Error resyncing deposits", { userId: req.user?.id, error: error.message });
    return res.status(500).json({ ok: false, message: error.message || "Unable to resync deposits." });
  }
}
