import prisma from '../src/db/prisma.js';

// Legacy support: for now, we wrap Prisma's raw query methods to maintain compatibility
// while we refactor the models to use Prisma's fluent API.

export async function run(sql, params = []) {
  // Prisma doesn't return lastID/changes directly in $executeRaw for all DBs in the same way,
  // but for PostgreSQL it returns the number of affected rows.
  const changes = await prisma.$executeRawUnsafe(sql, ...params);
  return { changes, lastID: null }; // lastID is tricky in PG raw, better use Prisma fluent API
}

export async function get(sql, params = []) {
  const rows = await prisma.$queryRawUnsafe(sql, ...params);
  return rows[0] || null;
}

export async function all(sql, params = []) {
  return await prisma.$queryRawUnsafe(sql, ...params);
}

export const db = {
  run,
  get,
  all
};

export default prisma;
