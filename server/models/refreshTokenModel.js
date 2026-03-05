import prisma from '../src/db/prisma.js';

export async function createRefreshTokenRecord({ userId, tokenId, tokenHash, createdAt, expiresAt }) {
  return prisma.refreshToken.create({
    data: {
      userId,
      tokenId,
      tokenHash,
      createdAt: new Date(createdAt),
      expiresAt: new Date(expiresAt)
    }
  });
}

export async function getRefreshTokenById(tokenId) {
  return prisma.refreshToken.findUnique({
    where: { tokenId }
  });
}

export async function revokeRefreshToken({ tokenId, revokedAt, replacedBy }) {
  return prisma.refreshToken.update({
    where: { tokenId },
    data: {
      revokedAt: new Date(revokedAt),
      replacedBy: replacedBy || null
    }
  });
}

export async function revokeRefreshTokensForUser(userId) {
  return prisma.refreshToken.updateMany({
    where: { 
      userId,
      revokedAt: null
    },
    data: {
      revokedAt: new Date()
    }
  });
}
