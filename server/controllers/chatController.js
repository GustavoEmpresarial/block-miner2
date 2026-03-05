import prisma from '../src/db/prisma.js';
import loggerLib from "../utils/logger.js";
import { getMiningEngine } from "../src/miningEngineInstance.js";

const logger = loggerLib.child("ChatController");

export async function getMessages(req, res) {
  try {
    const messages = await prisma.chatMessage.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { name: true, username: true }
        }
      }
    });
    // Reverse to get chronological order for the UI
    res.json({ ok: true, messages: messages.reverse() });
  } catch (error) {
    logger.error("Failed to fetch chat messages", { error: error.message });
    res.status(500).json({ ok: false, message: "Unable to load messages." });
  }
}

export async function sendMessage(req, res) {
  try {
    const { message } = req.body;
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ ok: false, message: "Message cannot be empty." });
    }

    const chatMsg = await prisma.chatMessage.create({
      data: {
        userId: req.user.id,
        username: req.user.username || req.user.name,
        message: message.trim(),
        createdAt: new Date()
      }
    });
    const engine = getMiningEngine();
    if (engine && engine.io) {
      engine.io.emit('chat:new-message', chatMsg);
    }

    res.json({ ok: true, message: chatMsg });
  } catch (error) {
    logger.error("Failed to send message", { error: error.message });
    res.status(500).json({ ok: false, message: "Unable to send message." });
  }
}
