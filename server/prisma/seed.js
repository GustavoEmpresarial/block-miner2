import 'dotenv/config';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from '@prisma/client';
const { PrismaClient } = pkg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("Error: DATABASE_URL is not defined in environment variables.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const GH = 1_000_000_000;

async function main() {
  // 1. Seed Miners
  const miners = [
    {
      name: "AntMiner S19",
      slug: "antminer-s19",
      baseHashRate: 95 * GH,
      price: 150.0,
      slotSize: 2,
      imageUrl: "/assets/machines/3.png",
      isActive: true,
      showInShop: true
    },
    {
      name: "Bitmain T17",
      slug: "bitmain-t17",
      baseHashRate: 40 * GH,
      price: 45.0,
      slotSize: 1,
      imageUrl: "/assets/machines/2.png",
      isActive: true,
      showInShop: true
    },
    {
      name: "MicroBT M30S",
      slug: "microbt-m30s",
      baseHashRate: 88 * GH,
      price: 120.0,
      slotSize: 2,
      imageUrl: "/assets/machines/1.png",
      isActive: true,
      showInShop: true
    },
    {
      name: "Basic USB Miner",
      slug: "basic-usb-miner",
      baseHashRate: 2 * GH,
      price: 5.0,
      slotSize: 1,
      imageUrl: "/assets/machines/reward3.png",
      isActive: true,
      showInShop: true
    },
    {
      name: "Pulse Mini v1",
      slug: "faucet-micro-miner",
      baseHashRate: 1 * GH,
      price: 0,
      slotSize: 1,
      imageUrl: "/assets/machines/reward2.png",
      isActive: true,
      showInShop: false
    }
  ];

  console.log('Seed: Start seeding miners...');
  for (const minerData of miners) {
    await prisma.miner.upsert({
      where: { slug: minerData.slug },
      update: minerData,
      create: minerData,
    });
  }

  // 2. Seed Faucet Reward
  const faucetMiner = await prisma.miner.findUnique({ where: { slug: 'faucet-micro-miner' } });
  if (faucetMiner) {
    await prisma.faucetReward.upsert({
      where: { minerId: faucetMiner.id },
      update: { isActive: true, cooldownMs: 3600000 },
      create: { minerId: faucetMiner.id, isActive: true, cooldownMs: 3600000 }
    });
    console.log('Seed: Faucet reward configured!');
  }

  // 3. Seed Auto Mining Reward
  console.log('Seed: Configuring Auto Mining Reward...');
  await prisma.autoMiningReward.upsert({
    where: { slug: 'pulse-gpu-v1' },
    update: {
      name: "Pulse GPU v1",
      gpuHashRate: 1 * GH,
      isActive: true,
      imageUrl: "/assets/machines/reward3.png",
      description: "Hardware de mineração automática de baixo consumo."
    },
    create: {
      name: "Pulse GPU v1",
      slug: "pulse-gpu-v1",
      gpuHashRate: 1 * GH,
      isActive: true,
      imageUrl: "/assets/machines/reward3.png",
      description: "Hardware de mineração automática de baixo consumo."
    }
  });

  console.log('Seed: All data seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
