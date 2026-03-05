import prisma from './db.js';

const DEFAULT_DAILY_LIMIT = 1;

export async function getUserShortlinkStatus(userId) {
  const status = await prisma.shortlinkCompletion.findUnique({
    where: { userId }
  });
  
  if (!status) {
    return {
      id: null,
      user_id: userId,
      shortlink_type: "internal",
      current_step: 0,
      daily_runs: 0,
      completed_at: null,
      reset_at: null,
      created_at: null,
      isCompleted: false,
      canRetry: true,
      dailyLimit: DEFAULT_DAILY_LIMIT,
      remainingRuns: DEFAULT_DAILY_LIMIT
    };
  }

  const now = new Date();
  const completedRuns = status.dailyRuns || 0;
  const isCompleted = completedRuns >= DEFAULT_DAILY_LIMIT;
  const resetAt = status.resetAt || null;
  
  const canRetry = !isCompleted || (resetAt && resetAt <= now);
  
  return {
    ...status,
    user_id: status.userId,
    shortlink_type: status.shortlinkType,
    current_step: status.currentStep,
    daily_runs: completedRuns,
    completed_at: status.completedAt,
    reset_at: resetAt,
    created_at: status.createdAt,
    isCompleted,
    canRetry,
    dailyLimit: DEFAULT_DAILY_LIMIT,
    remainingRuns: Math.max(DEFAULT_DAILY_LIMIT - completedRuns, 0)
  };
}

export async function updateShortlinkStep(userId, step) {
  return prisma.shortlinkCompletion.upsert({
    where: { userId },
    update: { currentStep: step },
    create: {
      userId,
      shortlinkType: "internal",
      currentStep: step,
      dailyRuns: 0
    }
  });
}

export async function completeShortlinkRun(userId) {
  const status = await prisma.shortlinkCompletion.upsert({
    where: { userId },
    update: {
      currentStep: 0,
      completedAt: new Date(),
      dailyRuns: { increment: 1 }
    },
    create: {
      userId,
      shortlinkType: "internal",
      currentStep: 0,
      dailyRuns: 1,
      completedAt: new Date()
    }
  });
  
  const currentStatus = await getUserShortlinkStatus(userId);
  return {
    completedAt: status.completedAt,
    dailyRuns: status.dailyRuns,
    remainingRuns: currentStatus.remainingRuns
  };
}

export async function startShortlinkRun(userId) {
  return prisma.shortlinkCompletion.upsert({
    where: { userId },
    update: { currentStep: 0 },
    create: {
      userId,
      shortlinkType: "internal",
      currentStep: 0,
      dailyRuns: 0
    }
  });
}

export async function resetShortlinkCompletion(userId) {
  return prisma.shortlinkCompletion.update({
    where: { userId },
    data: {
      completedAt: null,
      currentStep: 0,
      dailyRuns: 0,
      resetAt: new Date()
    }
  });
}

export async function resetAllShortlinks() {
  return prisma.shortlinkCompletion.updateMany({
    data: {
      completedAt: null,
      currentStep: 0,
      dailyRuns: 0,
      resetAt: new Date()
    }
  });
}
