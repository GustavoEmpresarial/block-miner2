import prisma from './db.js';

export async function createAuditLog({ userId, action, ip, userAgent, details }) {
  const detailsJson = details ? JSON.stringify(details) : null;

  return prisma.auditLog.create({
    data: {
      userId: userId || null,
      action,
      ip: ip || null,
      userAgent: userAgent || null,
      detailsJson,
      createdAt: new Date()
    }
  });
}
