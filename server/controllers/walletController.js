import { ethers } from "ethers";
import * as walletModel from "../models/walletModel.js";
import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("WalletController");

export async function getBalance(req, res) {
  try {
    const balance = await walletModel.getUserBalance(req.user.id);
    res.json({ ok: true, balance });
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
    res.json({ ok: true, message: "Deposit request submitted." });
  } catch (error) {
    logger.error("Error requesting deposit", { error: error.message });
    res.status(500).json({ ok: false, message: "Unable to request deposit." });
  }
}
