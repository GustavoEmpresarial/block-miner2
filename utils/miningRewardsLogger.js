const { run } = require("../src/db/sqlite");
const logger = require("./logger").child("MiningRewardsLogger");

/**
 * Log a mining reward to the database for user visibility
 * @param {Object} reward - Reward data
 * @param {number} reward.userId - User ID
 * @param {number} reward.blockNumber - Block number
 * @param {number} reward.workAccumulated - User's work in this round
 * @param {number} reward.totalNetworkWork - Total network work
 * @param {number} reward.sharePercentage - User's share %
 * @param {number} reward.rewardAmount - Reward POL amount
 * @param {number} reward.balanceAfter - Balance after reward
 */
async function logMiningReward(reward) {
  try {
    await run(
      `
        INSERT INTO mining_rewards_log
          (user_id, block_number, work_accumulated, total_network_work, share_percentage, reward_amount, balance_after_reward, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        reward.userId,
        reward.blockNumber,
        reward.workAccumulated,
        reward.totalNetworkWork,
        reward.sharePercentage,
        reward.rewardAmount,
        reward.balanceAfter,
        Date.now()
      ]
    );
  } catch (error) {
    logger.error("Failed to log mining reward", {
      error: error.message,
      userId: reward.userId,
      blockNumber: reward.blockNumber
    });
  }
}

module.exports = {
  logMiningReward
};
