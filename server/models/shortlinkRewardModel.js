import prisma from './db.js';

export const INTERNAL_SHORTLINK_TYPE = "internal";
/** Nome exibido; o poder real vem de INTERNAL_REWARD_HASH_RATE (H/s). */
export const INTERNAL_REWARD_NAME = "Shortlink Reward (5 H/s)";
export const INTERNAL_REWARD_SLUG = "shortlink-5hs-reward";
/** H/s por nível 1 — era 5e9 por engano (5 GH/s), incompatível com o resto da economia. */
export const INTERNAL_REWARD_HASH_RATE = 5;
export const INTERNAL_REWARD_SLOT_SIZE = 1;
export const INTERNAL_REWARD_IMAGE_URL = "/assets/machines/reward3.png";

export async function ensureDefaultInternalReward() {
  let miner = await prisma.miner.findUnique({
    where: { slug: INTERNAL_REWARD_SLUG }
  });

  if (!miner) {
    miner = await prisma.miner.create({
      data: {
        name: INTERNAL_REWARD_NAME,
        slug: INTERNAL_REWARD_SLUG,
        baseHashRate: INTERNAL_REWARD_HASH_RATE,
        price: 0,
        slotSize: INTERNAL_REWARD_SLOT_SIZE,
        imageUrl: INTERNAL_REWARD_IMAGE_URL,
        isActive: true,
        showInShop: false
      }
    });
  } else {
    miner = await prisma.miner.update({
      where: { id: miner.id },
      data: {
        name: INTERNAL_REWARD_NAME,
        baseHashRate: INTERNAL_REWARD_HASH_RATE,
        price: 0,
        slotSize: INTERNAL_REWARD_SLOT_SIZE,
        imageUrl: INTERNAL_REWARD_IMAGE_URL,
        isActive: true,
        showInShop: false
      }
    });
  }

  return prisma.shortlinkReward.upsert({
    where: { shortlinkType: INTERNAL_SHORTLINK_TYPE },
    update: {
      minerId: miner.id,
      rewardName: INTERNAL_REWARD_NAME,
      hashRate: INTERNAL_REWARD_HASH_RATE,
      slotSize: INTERNAL_REWARD_SLOT_SIZE,
      imageUrl: INTERNAL_REWARD_IMAGE_URL,
      isActive: true
    },
    create: {
      shortlinkType: INTERNAL_SHORTLINK_TYPE,
      minerId: miner.id,
      rewardName: INTERNAL_REWARD_NAME,
      hashRate: INTERNAL_REWARD_HASH_RATE,
      slotSize: INTERNAL_REWARD_SLOT_SIZE,
      imageUrl: INTERNAL_REWARD_IMAGE_URL,
      isActive: true
    }
  });
}

export async function getActiveRewardByType(shortlinkType = INTERNAL_SHORTLINK_TYPE) {
  return prisma.shortlinkReward.findFirst({
    where: { 
      shortlinkType,
      isActive: true 
    },
    include: {
      miner: true
    }
  }).then(sr => sr ? ({
    ...sr,
    miner_name: sr.miner.name,
    miner_slug: sr.miner.slug,
    show_in_shop: sr.miner.showInShop
  }) : null);
}
