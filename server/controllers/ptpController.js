import crypto from 'crypto';
import prisma from '../src/db/prisma.js';
import { getBrazilCheckinDateKey } from '../utils/checkinDate.js';

const PTP_RATE_USD_PER_1000 = 0.10;
const PTP_EARNING_PER_VIEW_USD = PTP_RATE_USD_PER_1000 / 1000;

export async function createAd(req, res) {
  try {
    const userId = req.user.id;
    const { title, url, views } = req.body;
    const targetViews = Number(views || 0);
    const costUsd = (targetViews / 1000) * PTP_RATE_USD_PER_1000;

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (Number(user.usdcBalance) < costUsd) throw new Error("Insufficient balance");

      await tx.user.update({
        where: { id: userId },
        data: { usdcBalance: { decrement: costUsd } }
      });

      const adHash = crypto.randomBytes(8).toString('hex');
      await tx.ptpAd.create({
        data: {
          userId,
          title,
          url,
          hash: adHash,
          paidUsd: costUsd,
          targetViews,
          costUsd
        }
      });
    });

    res.json({ ok: true, message: 'Ad created successfully' });
  } catch (error) {
    console.error('Error creating ad:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
}

export async function getMyAds(req, res) {
  try {
    const ads = await prisma.ptpAd.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ ok: true, ads });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Server error' });
  }
}

export async function trackView(req, res) {
  try {
    const { adId, viewerHash } = req.body;
    
    await prisma.$transaction(async (tx) => {
      const ad = await tx.ptpAd.findUnique({ where: { id: Number(adId) } });
      if (!ad || ad.status !== 'active') return;

      const existingView = await tx.ptpView.findFirst({
        where: { adId: Number(adId), viewerHash }
      });
      if (existingView) return;

      await tx.ptpView.create({ data: { adId: Number(adId), viewerHash } });
      await tx.ptpAd.update({ where: { id: Number(adId) }, data: { views: { increment: 1 } } });
      
      await tx.ptpEarning.create({
        data: { userId: ad.userId, adId: Number(adId), amountUsd: PTP_EARNING_PER_VIEW_USD }
      });

      await tx.user.update({
        where: { id: ad.userId },
        data: { usdcBalance: { increment: PTP_EARNING_PER_VIEW_USD } }
      });
    });

    res.json({ ok: true, message: 'View tracked' });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Server error' });
  }
}
