import { ethers } from "ethers";
import * as walletModel from "../models/walletModel.js";
import prisma from "../src/db/prisma.js";
import loggerLib from "../utils/logger.js";
import cron from "node-cron";

const logger = loggerLib.child("WithdrawalsCron");

const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || "https://polygon-bor-rpc.publicnode.com";
const privateKey = process.env.WITHDRAWAL_PRIVATE_KEY;
const MOCK_RPC_URL = process.env.NODE_ENV === 'test' ? null : null; // Avoid conflicts

export async function processPendingWithdrawals() {
  if (process.env.NODE_ENV === 'test' && !process.env.REAL_RPC_TEST) {
    return; // Do not run real cron in tests
  }

  try {
    // Apenas `approved`: saques `pending` aguardam ação no admin (não enviar sem aprovação).
    const pending = await walletModel.getApprovedWithdrawals();
    if (!pending || pending.length === 0) return;

    if (!privateKey || privateKey === "0x0000000000000000000000000000000000000000000000000000000000000000") {
      logger.warn("No valid WITHDRAWAL_PRIVATE_KEY found. Skipping withdrawals processing.");
      return;
    }

    const provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL);
    let wallet;
    try {
      wallet = new ethers.Wallet(privateKey, provider);
    } catch (e) {
      logger.error("Failed to initialize wallet from private key", { error: e.message });
      return;
    }

    logger.info(`Processing ${pending.length} pending withdrawals...`);

    for (const tx of pending) {
      try {
        const fresh = await prisma.transaction.findUnique({ where: { id: tx.id } });
        if (!fresh || fresh.type !== "withdrawal" || fresh.status !== "approved") {
          logger.info(`Skip withdrawal ${tx.id}: no longer in approved state`);
          continue;
        }

        logger.info(`Sending ${tx.amount} POL to ${tx.address} for withdrawal ID ${tx.id}`);

        // Convert amount to Wei
        const amountWei = ethers.parseEther(tx.amount.toString());

        // Prepare transaction
        const txRequest = {
          to: tx.address,
          value: amountWei
        };

        // Send transaction
        const transactionResponse = await wallet.sendTransaction(txRequest);

        // Update DB directly to 'completed' with txHash
        await walletModel.updateTransactionStatus(tx.id, 'completed', transactionResponse.hash);

        logger.info(`Withdrawal ${tx.id} completed. TxHash: ${transactionResponse.hash}`);

        // Optional: wait for it to be mined
        // await transactionResponse.wait(); 
      } catch (err) {
        logger.error(`Error processing withdrawal ${tx.id}`, { error: err.message, txHash: err.transaction?.hash });
        // Update status to failed so it returns to user balances if configured correctly
        await walletModel.updateTransactionStatus(tx.id, 'failed');
      }
    }
  } catch (error) {
    logger.error("Error in processPendingWithdrawals", { error: error.message });
  }
}

export function startWithdrawalMonitoring() {
  logger.info("Withdrawal monitoring started -> Cron scheduled every 2 minutes");
  const task = cron.schedule('*/2 * * * *', processPendingWithdrawals);
  return [task];
}
