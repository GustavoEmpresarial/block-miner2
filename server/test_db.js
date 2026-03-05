import prisma from './src/db/prisma.js';

async function main() {
    const user = await prisma.user.findFirst({ where: { name: "whitelittle321" } });
    if (!user) return console.log("User not found by name whitelittle321");
    const miners = await prisma.userMiner.findMany({ where: { userId: user.id } });
    console.log("Miners for", user.name, ":", miners);
}

main().finally(() => prisma.$disconnect());
