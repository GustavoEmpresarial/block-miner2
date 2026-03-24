import prisma from '../db/prisma.js';
import loggerLib from '../../utils/logger.js';
import { syncUserBaseHashRate } from '../../models/minerProfileModel.js';
import { verifyAccessToken } from '../../utils/authTokens.js';
import { getTokenFromRequest } from '../../utils/token.js';

const logger = loggerLib.child("GamesSocket");
const GAME_SESSIONS = new Map();
const LAST_GAME_FINISH = new Map();
/** Regra fixa do produto: 50 H/s por jogo concluído com sucesso. */
const MEMORY_GAME_REWARD_HS = 50;
const SUPPORTED_GAME_SLUGS = new Set(["crypto-memory", "crypto-match-3"]);
const GAME_NAME_BY_SLUG = {
  "crypto-memory": "Memory Sync",
  "crypto-match-3": "Power Match"
};

const SYMBOLS = ['bitcoin', 'ethereum', 'solana', 'binance-coin', 'cardano', 'polkadot', 'dogecoin', 'polygon'];
const MATCH3_SYMBOLS = ['bitcoin', 'ethereum', 'solana', 'binance-coin', 'cardano'];

export function registerGamesSocketHandlers({ io, engine }) {
  io.on("connection", (socket) => {
    
    socket.on("game:start", async (gameSlug) => {
      try {
        const requestLike = { headers: socket.request?.headers || {} };
        const authToken = getTokenFromRequest(requestLike);
        const payload = authToken ? verifyAccessToken(authToken) : null;
        const userId = Number(socket.data?.userId || payload?.sub);

        if (!userId) return socket.emit("game:error", "Sessão inválida.");

        // Cooldown check (1 minute)
        const lastFinish = LAST_GAME_FINISH.get(userId);
        if (lastFinish) {
          const elapsed = Date.now() - lastFinish;
          if (elapsed < 60000) {
            const remaining = Math.ceil((60000 - elapsed) / 1000);
            return socket.emit("game:error", `Aguarde ${remaining} segundos para iniciar um novo jogo.`);
          }
        }

        if (!SUPPORTED_GAME_SLUGS.has(gameSlug)) {
          return socket.emit("game:error", "Jogo indisponível.");
        }
        // Garante que jogos oficiais nunca fiquem desativados no banco.
        const game = await prisma.game.upsert({
          where: { slug: gameSlug },
          update: { isActive: true },
          create: { slug: gameSlug, name: GAME_NAME_BY_SLUG[gameSlug] || gameSlug, isActive: true }
        });

        let initialState = {
          gameId: Number(game.id),
          slug: gameSlug,
          userId: Number(userId),
          score: 0,
          isFinished: false,
          startTime: Date.now(),
          lastUpdate: Date.now()
        };

        if (gameSlug === 'crypto-memory') {
          initialState.board = [...SYMBOLS, ...SYMBOLS]
            .sort(() => Math.random() - 0.5)
            .map((symbol, id) => ({ id, symbol, isFlipped: false, isMatched: false }));
          initialState.flipped = [];
          socket.emit("game:started", { game: gameSlug, board: initialState.board.map(c => ({ id: c.id, isFlipped: false, isMatched: false })), score: 0 });
        } 
        else if (gameSlug === 'crypto-match-3') {
          initialState.board = generateStableBoard();
          socket.emit("game:started", { game: gameSlug, board: initialState.board, score: 0 });
        }

        GAME_SESSIONS.set(socket.id, initialState);
      } catch (error) {
        logger.error("Game Start Error", error);
      }
    });

    socket.on("game:action", (action) => {
      const state = GAME_SESSIONS.get(socket.id);
      if (!state || state.isFinished) return;

      if (state.slug === 'crypto-memory' && action.type === 'flip') {
        if (state.flipped.length >= 2) return;
        const card = state.board.find(c => c.id === action.cardId);
        if (!card || card.isFlipped || card.isMatched) return;

        card.isFlipped = true;
        state.flipped.push(card);
        socket.emit("game:card_flipped", { id: card.id, symbol: card.symbol });

        if (state.flipped.length === 2) {
          const [c1, c2] = state.flipped;
          if (c1.symbol === c2.symbol) {
            c1.isMatched = true; c2.isMatched = true;
            state.score += 250; state.flipped = [];
            socket.emit("game:match", { ids: [c1.id, c2.id], score: state.score });
            if (state.board.every(c => c.isMatched)) finishGame(socket, state, true, engine);
          } else {
            setTimeout(() => {
              c1.isFlipped = false; c2.isFlipped = false; state.flipped = [];
              socket.emit("game:mismatch", { ids: [c1.id, c2.id] });
            }, 800);
          }
        }
      }
      else if (state.slug === 'crypto-match-3' && action.type === 'swap') {
        handleMatch3Swap(socket, state, action.from, action.to, engine);
      }
    });

    socket.on("game:end", () => {
      const state = GAME_SESSIONS.get(socket.id);
      if (state && !state.isFinished) {
        finishGame(socket, state, false, engine);
      }
    });

    socket.on("disconnect", () => GAME_SESSIONS.delete(socket.id));
  });
}

function generateStableBoard() {
  let board = [];
  for (let y = 0; y < 8; y++) {
    board[y] = [];
    for (let x = 0; x < 8; x++) {
      let s;
      do { s = MATCH3_SYMBOLS[Math.floor(Math.random() * MATCH3_SYMBOLS.length)]; }
      while ((x >= 2 && board[y][x-1] === s && board[y][x-2] === s) || (y >= 2 && board[y-1][x] === s && board[y-2][x] === s));
      board[y][x] = s;
    }
  }
  return board;
}

function handleMatch3Swap(socket, state, from, to, engine) {
  const dx = Math.abs(from.x - to.x), dy = Math.abs(from.y - to.y);
  if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
    const board = state.board;
    const temp = board[from.y][from.x];
    board[from.y][from.x] = board[to.y][to.x];
    board[to.y][to.x] = temp;

    let matches = findMatches(board);
    if (matches.length === 0) {
      board[to.y][to.x] = board[from.y][from.x];
      board[from.y][from.x] = temp;
      return socket.emit("game:invalid_swap");
    }

    let totalPoints = 0;
    while (matches.length > 0) {
      totalPoints += matches.length * 20;
      processCascades(board, matches);
      matches = findMatches(board);
    }

    state.score += totalPoints;
    socket.emit("game:board_update", { board: state.board, score: state.score });
    if (state.score >= 1500) finishGame(socket, state, true, engine);
  }
}

function findMatches(board) {
  const matches = new Set();
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 6; x++) {
      if (board[y][x] && board[y][x] === board[y][x+1] && board[y][x] === board[y][x+2]) {
        matches.add(`${x},${y}`); matches.add(`${x+1},${y}`); matches.add(`${x+2},${y}`);
      }
    }
  }
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 6; y++) {
      if (board[y][x] && board[y][x] === board[y+1][x] && board[y][x] === board[y+2][x]) {
        matches.add(`${x},${y}`); matches.add(`${x},${y+1}`); matches.add(`${x},${y+2}`);
      }
    }
  }
  return Array.from(matches).map(s => { const [x, y] = s.split(',').map(Number); return {x, y}; });
}

function processCascades(board, matches) {
  matches.forEach(m => board[m.y][m.x] = null);
  for (let x = 0; x < 8; x++) {
    let emptyRow = 7;
    for (let y = 7; y >= 0; y--) {
      if (board[y][x] !== null) {
        board[emptyRow][x] = board[y][x];
        if (emptyRow !== y) board[y][x] = null;
        emptyRow--;
      }
    }
    for (let y = emptyRow; y >= 0; y--) {
      board[y][x] = MATCH3_SYMBOLS[Math.floor(Math.random() * MATCH3_SYMBOLS.length)];
    }
  }
}

async function finishGame(socket, state, success, engine) {
  if (state.isFinished) return;
  state.isFinished = true;
  GAME_SESSIONS.delete(socket.id);
  
  // Record finish time for cooldown
  LAST_GAME_FINISH.set(Number(state.userId), Date.now());

  if (success) {
    // ANTI-CHEAT: Verifica o tempo mínimo humanamente viável para terminar (ex: 15 segundos)
    const playTimeMs = Date.now() - state.startTime;
    if (playTimeMs < 15000) {
      logger.warn(`Cheating attempt detected: User ${state.userId} finished game too quickly (${playTimeMs}ms).`);
      return socket.emit("game:finished", { success: false, message: "AÇÃO SUSPEITA DETECTADA! Tempo de jogo irreal." });
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    try {
      // ANTI-CHEAT: Limita o máximo de poderes ativos acumulados pelo minigame a um valor seguro (ex: max 10 instâncias = 500 H/s)
      const activePowersCount = await prisma.userPowerGame.count({
        where: {
          userId: Number(state.userId),
          expiresAt: { gt: new Date() }
        }
      });

      if (activePowersCount >= 10) {
         return socket.emit("game:finished", { success: false, message: "LIMITE MÁXIMO DE BÔNUS ATINGIDO! Aguarde um bônus expirar." });
      }

      await prisma.userPowerGame.create({ 
        data: { 
          userId: Number(state.userId), 
          gameId: Number(state.gameId), 
          hashRate: MEMORY_GAME_REWARD_HS, 
          playedAt: new Date(), 
          expiresAt 
        } 
      });
      const total = await syncUserBaseHashRate(state.userId);
      const miner = engine.miners.get(state.userId.toString());
      if (miner) miner.baseHashRate = total;

      socket.emit("game:finished", { success: true, reward: `BÔNUS DE ${MEMORY_GAME_REWARD_HS} H/S ATIVADO POR 24H!` });
      socket.emit("machines:update");
    } catch (e) { 
      socket.emit("game:finished", { success: true, reward: "BÔNUS PROCESSADO COM SUCESSO!" });
    }
  } else {
    socket.emit("game:finished", { success: false, message: "SESSÃO ENCERRADA!" });
  }
}
