import prisma from '../src/db/prisma.js';

export async function getUserById(userId) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      isBanned: true,
      polBalance: true,
      usdcBalance: true
    }
  });
}

export async function updateUserLoginMeta(userId, { ip, userAgent }) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      lastLoginAt: new Date(),
      ip: ip || null,
      userAgent: userAgent || null
    }
  });
}

export async function listUsers({ page, pageSize, query, fromDate, toDate }) {
  const skip = (page - 1) * pageSize;
  const where = {};

  if (query) {
    const q = query.toLowerCase();
    where.OR = [
      { email: { contains: q, mode: 'insensitive' } },
      { username: { contains: q, mode: 'insensitive' } },
      { name: { contains: q, mode: 'insensitive' } }
    ];
  }

  if (fromDate || toDate) {
    where.createdAt = {};
    if (fromDate) where.createdAt.gte = new Date(fromDate);
    if (toDate) where.createdAt.lte = new Date(toDate);
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        ip: true,
        isBanned: true,
        createdAt: true,
        lastLoginAt: true
      }
    }),
    prisma.user.count({ where })
  ]);

  return { users, total };
}
