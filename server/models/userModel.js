import prisma from '../src/db/prisma.js';

function isPrismaMissingColumnError(err) {
  return err?.code === "P2022" || /column.*does not exist/i.test(String(err?.message || ""));
}

/** Evita SELECT * — BDs antigas sem algumas colunas do schema não quebram o middleware. */
const GET_USER_BY_ID_SELECT_TIERS = [
  {
    id: true,
    name: true,
    username: true,
    email: true,
    isBanned: true,
    polBalance: true,
    usdcBalance: true
  },
  {
    id: true,
    name: true,
    username: true,
    email: true,
    isBanned: true
  },
  { id: true, name: true, email: true, isBanned: true }
];

export async function getUserById(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id)) return null;
  for (const select of GET_USER_BY_ID_SELECT_TIERS) {
    try {
      return await prisma.user.findUnique({ where: { id }, select });
    } catch (err) {
      if (!isPrismaMissingColumnError(err)) throw err;
    }
  }
  return null;
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
    const raw = String(query).trim();
    if (raw) {
      const orConditions = [
        { email: { contains: raw, mode: "insensitive" } },
        { username: { contains: raw, mode: "insensitive" } },
        { name: { contains: raw, mode: "insensitive" } },
        { walletAddress: { contains: raw, mode: "insensitive" } },
        { refCode: { contains: raw, mode: "insensitive" } }
      ];
      const idStr = raw.replace(/^#/, "").trim();
      if (/^\d+$/.test(idStr)) {
        const idNum = parseInt(idStr, 10);
        if (idNum > 0) {
          orConditions.push({ id: idNum });
          orConditions.push({ oldId: idNum });
        }
      }
      where.OR = orConditions;
    }
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
        walletAddress: true,
        refCode: true,
        polBalance: true,
        isBanned: true,
        createdAt: true,
        lastLoginAt: true
      }
    }),
    prisma.user.count({ where })
  ]);

  return { users, total };
}
