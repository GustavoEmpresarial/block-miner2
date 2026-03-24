import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuthStore } from '../store/auth';
import { Brain, LayoutGrid, Trophy, Clock, RotateCcw, Play } from 'lucide-react';
import { toast } from 'sonner';

const SOCKET_URL =
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
const CRYPTO_ICONS = {
  'bitcoin': '/icons/bitcoin.png',
  'ethereum': '/icons/ethereum.png',
  'solana': '/icons/solana.png',
  'binance-coin': '/icons/binance-coin.png',
  'cardano': '/icons/cardano.png',
  'polkadot': '/icons/polkadot.png',
  'dogecoin': '/icons/dogecoin.png',
  'polygon': '/icons/polygon.png'
};
const SYMBOL_FALLBACK = {
  'bitcoin': '₿',
  'ethereum': 'Ξ',
  'solana': 'S',
  'binance-coin': 'B',
  'cardano': 'A',
  'polkadot': 'D',
  'dogecoin': 'Ð',
  'polygon': 'M'
};
const MEMORY_CLOSE_DELAY_MS = 420;
const MEMORY_FLIP_EASING = 0.34;
const MATCH3_FALL_EASING = 0.14;
const PARTICLE_BURST_COUNT = 14;
const BASE_CANVAS_WIDTH = 800;
const BASE_CANVAS_HEIGHT = 500;

const ICON_IMAGES = {};
Object.entries(CRYPTO_ICONS).forEach(([k, v]) => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onerror = () => { img.__broken = true; };
  img.src = v;
  ICON_IMAGES[k] = img;
});

function canDrawImage(img) {
  return Boolean(
    img &&
    !img.__broken &&
    img.complete &&
    img.naturalWidth > 0 &&
    img.naturalHeight > 0
  );
}

function drawRoundedRect(ctx, x, y, w, h, r = 12) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
}

function drawSymbolFallback(ctx, symbol, x, y, size) {
  const label = SYMBOL_FALLBACK[symbol] || '?';
  ctx.save();
  const grd = ctx.createLinearGradient(x, y, x + size, y + size);
  grd.addColorStop(0, '#60a5fa');
  grd.addColorStop(1, '#2563eb');
  ctx.fillStyle = grd;
  drawRoundedRect(ctx, x, y, size, size, Math.min(14, size / 5));
  ctx.fill();

  ctx.fillStyle = '#e2e8f0';
  ctx.font = `900 ${Math.max(14, Math.floor(size * 0.42))}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + size / 2, y + size / 2 + 1);
  ctx.restore();
}

export default function Games() {
  const { token } = useAuthStore();
  const [socket, setSocket] = useState(null);
  const [socketReady, setSocketReady] = useState(false);
  const [activeGame, setActiveGame] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [isGameOver, setIsGameOver] = useState(false);
  const [rewardMessage, setRewardMessage] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [cooldowns, setCooldowns] = useState({ memory: 0, 'match-3': 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedCell, setSelectedCell] = useState(null);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const activeGameRef = useRef(null);
  const startedGameRef = useRef(null);

  // High Precision Engine States
  const canvasRef = useRef(null);
  const gameLoopRef = useRef(null);
  const particles = useRef([]);
  const visualBoard = useRef([]);
  const pointer = useRef({ x: 400, y: 250, isDown: false });

  useEffect(() => {
    activeGameRef.current = activeGame;
  }, [activeGame]);

  useEffect(() => {
    const updateViewport = () => {
      setIsMobileViewport(window.innerWidth < 768);
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--app-vh', `${vh}px`);
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
    };
  }, []);

  const mobileFullscreen = Boolean(activeGame && isMobileViewport);

  useEffect(() => {
    if (!mobileFullscreen) return undefined;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileFullscreen]);

  useEffect(() => {
    const newSocket = io(SOCKET_URL, {
      auth: { token },
      withCredentials: true,
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      setSocketReady(true);
    });

    newSocket.on('disconnect', () => {
      setSocketReady(false);
    });

    newSocket.on('connect_error', (err) => {
      setSocketReady(false);
      toast.error(`Falha de conexão com jogos: ${err?.message || 'socket offline'}`);
    });

    newSocket.on('game:error', (msg) => {
      toast.error(msg);
      setIsProcessing(false);
    });

    newSocket.on('game:cooldown', (payload) => {
      const gameSlug = payload?.game;
      const remaining = Math.max(0, Number(payload?.remaining || 0));
      const gameKey = gameSlug === 'crypto-memory' ? 'memory' : gameSlug === 'crypto-match-3' ? 'match-3' : null;
      if (!gameKey) return;
      setCooldowns((prev) => ({ ...prev, [gameKey]: remaining }));
    });

    newSocket.on('game:started', (data) => {
      setGameState(data); setIsGameOver(false); setRewardMessage(null); setIsProcessing(false);
      setSelectedCell(null);
      if (data?.game === 'crypto-memory') startedGameRef.current = 'memory';
      if (data?.game === 'crypto-match-3') startedGameRef.current = 'match-3';
      particles.current = [];
      if (data.game === 'crypto-match-3' && data.board) {
        visualBoard.current = data.board.map((row, y) => row.map((s, x) => ({ symbol: s, x, y, visualX: x, visualY: y })));
      }
      setTimeLeft(data.game === 'crypto-memory' ? 60 : 180);
    });

    newSocket.on('game:card_flipped', (data) => {
      setGameState(prev => { if (!prev || !prev.board) return prev; return { ...prev, board: prev.board.map(c => c.id === data.id ? { ...c, symbol: data.symbol, isFlipped: true, isClosing: false, flipAnim: 0 } : c) }; });
    });

    newSocket.on('game:match', (data) => {
      setGameState(prev => { if (!prev || !prev.board) return prev; return { ...prev, score: data.score, board: prev.board.map(c => data.ids.includes(c.id) ? { ...c, isMatched: true } : c) }; });
      createExplosion(400, 250);
    });

    newSocket.on('game:mismatch', (data) => {
      setIsProcessing(true);
      setGameState(prev => {
        if (!prev || !prev.board) return prev;
        return {
          ...prev,
          board: prev.board.map(c => data.ids.includes(c.id) ? { ...c, isFlipped: false, isClosing: true } : c)
        };
      });
      setTimeout(() => {
        setGameState(prev => { if (!prev || !prev.board) return prev; return { ...prev, board: prev.board.map(c => data.ids.includes(c.id) ? { ...c, isClosing: false, symbol: null, flipAnim: 0 } : c) }; });
        setIsProcessing(false);
      }, MEMORY_CLOSE_DELAY_MS);
    });

    newSocket.on('game:board_update', (data) => {
      if (!data.board) return;
      if (visualBoard.current.length > 0) {
        visualBoard.current = data.board.map((row, y) => row.map((symbol, x) => {
          const currentVisual = visualBoard.current[y]?.[x];
          if (!currentVisual || currentVisual.symbol !== symbol) return { symbol, x, y, visualX: x, visualY: y - 3 };
          return { ...currentVisual, x, y };
        }));
      }
      setGameState(prev => ({ ...prev, score: data.score, board: data.board }));
      createExplosion(400, 250);
    });

    newSocket.on('game:score_update', (data) => { setGameState(prev => prev ? ({ ...prev, score: data.score }) : prev); });
    newSocket.on('game:finished', (data) => {
      setIsGameOver(true);
      const gameKey =
        data?.game === 'crypto-memory'
          ? 'memory'
          : data?.game === 'crypto-match-3'
            ? 'match-3'
            : (startedGameRef.current || activeGameRef.current);
      const cooldownSec = Math.max(0, Number(data?.cooldownSec || 60));
      const currentGame = gameKey;
      if (currentGame) {
        setCooldowns((prev) => ({ ...prev, [currentGame]: cooldownSec }));
      }
      setSelectedCell(null);
      if (data.success) {
        setRewardMessage(data.reward);
        toast.success(data.reward);
      } else toast.error(data.message);
    });

    setSocket(newSocket);
    return () => {
      newSocket.disconnect();
      setSocketReady(false);
    };
  }, [token]);

  useEffect(() => {
    if (gameState && !isGameOver && timeLeft > 0) {
      const timer = setInterval(() => { setTimeLeft(prev => { 
        if (prev <= 1) { 
          clearInterval(timer); 
          setIsGameOver(true); 
          if (socket) socket.emit('game:end');
          return 0; 
        } return prev - 1; 
      }); }, 1000);
      return () => clearInterval(timer);
    }
  }, [gameState, isGameOver, timeLeft, socket]);

  useEffect(() => {
    const hasCooldown = cooldowns.memory > 0 || cooldowns['match-3'] > 0;
    if (!hasCooldown) return undefined;
    const timer = setInterval(() => {
      setCooldowns((prev) => ({
        memory: Math.max(0, prev.memory - 1),
        'match-3': Math.max(0, prev['match-3'] - 1)
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldowns]);

  const createExplosion = (x, y) => {
    for (let i = 0; i < PARTICLE_BURST_COUNT; i++) {
      particles.current.push({ x, y, vx: (Math.random() - 0.5) * 12, vy: (Math.random() - 0.5) * 12, life: 1.0, color: '#3b82f6', size: Math.random() * 5 + 2 });
    }
  };

  useEffect(() => {
    if (!activeGame || !gameState || isGameOver) return;
    const render = () => {
      const canvas = canvasRef.current; if (!canvas) return;
      const ctx = canvas.getContext('2d');
      try {
        const rect = canvas.getBoundingClientRect();
        const cssW = Math.max(1, Math.round(rect.width || BASE_CANVAS_WIDTH));
        const cssH = Math.max(1, Math.round(rect.height || BASE_CANVAS_HEIGHT));
        const dpr = Math.max(1, Number(window.devicePixelRatio || 1));
        const pixelW = Math.round(cssW * dpr);
        const pixelH = Math.round(cssH * dpr);

        if (canvas.width !== pixelW || canvas.height !== pixelH) {
          canvas.width = pixelW;
          canvas.height = pixelH;
        }

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssW, cssH);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const scaleX = cssW / BASE_CANVAS_WIDTH;
        const scaleY = cssH / BASE_CANVAS_HEIGHT;
        ctx.save();
        ctx.scale(scaleX, scaleY);

        // Cyberpunk BG
        ctx.fillStyle = '#020617'; ctx.fillRect(0, 0, BASE_CANVAS_WIDTH, BASE_CANVAS_HEIGHT);
        ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1;
        for (let i = 0; i < BASE_CANVAS_WIDTH; i += 50) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, BASE_CANVAS_HEIGHT); ctx.stroke(); }
        for (let i = 0; i < BASE_CANVAS_HEIGHT; i += 50) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(BASE_CANVAS_WIDTH, i); ctx.stroke(); }

        if (activeGame === 'memory') drawMemory(ctx, gameState);
        if (activeGame === 'match-3') drawMatch3(ctx, gameState);

        // Update Particles
        particles.current = particles.current.filter(p => p.life > 0);
        particles.current.forEach(p => {
          p.x += p.vx; p.y += p.vy; p.life -= 0.02;
          ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        });
        ctx.globalAlpha = 1.0;

        if (!isMobileViewport) {
          // Desktop-only virtual cursor
          const mx = pointer.current.x;
          const my = pointer.current.y;
          ctx.strokeStyle = pointer.current.isDown ? '#ef4444' : '#3b82f6';
          ctx.lineWidth = 2;
          ctx.shadowBlur = 10; ctx.shadowColor = ctx.strokeStyle;
          ctx.beginPath(); ctx.arc(mx, my, 12, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(mx - 18, my); ctx.lineTo(mx + 18, my); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(mx, my - 18); ctx.lineTo(mx, my + 18); ctx.stroke();
          ctx.fillStyle = ctx.strokeStyle;
          ctx.beginPath(); ctx.arc(mx, my, 2, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        }
        ctx.restore();
      } catch (e) {
        console.error('Games render error', e);
      }

      gameLoopRef.current = requestAnimationFrame(render);
    };
    gameLoopRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(gameLoopRef.current);
  }, [activeGame, gameState, isGameOver, selectedCell, isMobileViewport]);

  const getMemoryLayout = () => {
    const size = isMobileViewport ? 108 : 100;
    const padding = isMobileViewport ? 16 : 20;
    return { size, padding };
  };

  const getMatch3Layout = () => {
    const cell = isMobileViewport ? 54 : 50;
    const gap = isMobileViewport ? 9 : 8;
    return { cell, gap };
  };

  const drawMemory = (ctx, state) => {
    if (!state.board) return;
    const { size, padding } = getMemoryLayout();
    const cols = 4;
    const sx = (800 - (cols * (size + padding))) / 2, sy = (500 - (4 * (size + padding))) / 2;
    state.board.forEach((card, i) => {
      const x = sx + (i % cols) * (size + padding), y = sy + Math.floor(i / cols) * (size + padding);
      ctx.save(); ctx.translate(x + size / 2, y + size / 2);
      const shouldShowFace = card.isFlipped || card.isMatched || card.isClosing;
      const currentFlip = typeof card.flipAnim === 'number' ? card.flipAnim : 0;
      const targetFlip = shouldShowFace ? 1 : 0;
      card.flipAnim = currentFlip + (targetFlip - currentFlip) * MEMORY_FLIP_EASING;
      if (Math.abs(targetFlip - card.flipAnim) < 0.01) card.flipAnim = targetFlip;

      let sX = Math.cos(card.flipAnim * Math.PI);
      if (Math.abs(sX) < 0.001) sX = 0.001;
      ctx.scale(sX, 1);
      ctx.fillStyle = (card.isFlipped || card.isMatched) ? '#2563eb' : '#1e293b';
      if (card.isMatched) ctx.fillStyle = '#059669';
      drawRoundedRect(ctx, -size / 2, -size / 2, size, size, 16); ctx.fill();
      if (Math.abs(sX) > 0.1 && shouldShowFace && card.symbol) {
        const img = ICON_IMAGES[card.symbol];
        if (canDrawImage(img)) {
          ctx.scale(-1, 1);
          try {
            ctx.drawImage(img, -size / 3, -size / 3, size / 1.5, size / 1.5);
          } catch (_) {
            img.__broken = true;
            drawSymbolFallback(ctx, card.symbol, -size / 3, -size / 3, size / 1.5);
          }
        } else {
          ctx.scale(-1, 1);
          drawSymbolFallback(ctx, card.symbol, -size / 3, -size / 3, size / 1.5);
        }
      }
      ctx.restore();
    });
  };

  const drawMatch3 = (ctx, state) => {
    if (!visualBoard.current.length) return;
    const { cell: s, gap: p } = getMatch3Layout();
    const sx = (800 - (8 * (s + p))) / 2, sy = (500 - (8 * (s + p))) / 2;
    const glowPulse = 0.65 + Math.sin(Date.now() / 170) * 0.2;
    visualBoard.current.forEach((row, y) => {
      row.forEach((piece, x) => {
        piece.visualY += (y - piece.visualY) * MATCH3_FALL_EASING;
        piece.visualX += (x - piece.visualX) * MATCH3_FALL_EASING;
        const px = sx + piece.visualX * (s + p), py = sy + piece.visualY * (s + p);
        const isSelected = selectedCell && selectedCell.x === x && selectedCell.y === y;
        const scale = isSelected ? 1.12 : 1;

        ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
        drawRoundedRect(ctx, sx + x * (s + p), sy + y * (s + p), s, s, 12);
        ctx.fill();

        if (isSelected) {
          const bx = sx + x * (s + p) - 1.5;
          const by = sy + y * (s + p) - 1.5;
          const bw = s + 3;
          const bh = s + 3;
          ctx.save();
          ctx.strokeStyle = `rgba(96,165,250,${glowPulse})`;
          ctx.lineWidth = 2.4;
          ctx.shadowBlur = 18;
          ctx.shadowColor = '#60a5fa';
          drawRoundedRect(ctx, bx, by, bw, bh, 13);
          ctx.stroke();
          ctx.restore();
        }
        const img = ICON_IMAGES[piece.symbol];
        if (canDrawImage(img)) {
          ctx.save();
          ctx.translate(px + s / 2, py + s / 2);
          ctx.scale(scale, scale);
          try {
            ctx.drawImage(img, -s / 2 + 10, -s / 2 + 10, s - 20, s - 20);
          } catch (_) {
            img.__broken = true;
            ctx.restore();
            drawSymbolFallback(ctx, piece.symbol, px + 8, py + 8, s - 16);
            return;
          }
          ctx.restore();
        } else {
          drawSymbolFallback(ctx, piece.symbol, px + 8, py + 8, s - 16);
        }
      });
    });
  };

  const syncMouse = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    // POSIÇÃO 100% RELATIVA AO ELEMENTO (Imune a DPI/Zoom)
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);

    const x = ((clientX - rect.left) / rect.width) * 800;
    const y = ((clientY - rect.top) / rect.height) * 500;

    pointer.current.x = x;
    pointer.current.y = y;
    return { x, y };
  };

  const handleMouseDown = (e) => {
    if (isGameOver || isProcessing) return;
    pointer.current.isDown = true;
    const { x, y } = syncMouse(e);
    if (activeGame === 'memory') {
      const { size: s, padding: p } = getMemoryLayout();
      const sx = (800 - (4 * (s + p))) / 2;
      const sy = (500 - (4 * (s + p))) / 2;
      const col = Math.floor((x - sx) / (s + p)), row = Math.floor((y - sy) / (s + p));
      if (col >= 0 && col < 4 && row >= 0 && row < 4) {
        const lx = (x - sx) % (s + p), ly = (y - sy) % (s + p);
        if (lx < s && ly < s) socket.emit('game:action', { type: 'flip', cardId: row * 4 + col });
      }
    } else if (activeGame === 'match-3') {
      const { cell: s, gap: p } = getMatch3Layout();
      const sx = (800 - (8 * (s + p))) / 2;
      const sy = (500 - (8 * (s + p))) / 2;
      const cx = Math.floor((x - sx) / (s + p)), cy = Math.floor((y - sy) / (s + p));
      if (cx >= 0 && cx < 8 && cy >= 0 && cy < 8) {
        if (!selectedCell) {
          setSelectedCell({ x: cx, y: cy });
          return;
        }

        const dx = Math.abs(cx - selectedCell.x);
        const dy = Math.abs(cy - selectedCell.y);
        if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
          // Optimistic local swap so player sees side-to-side movement immediately.
          const fromX = selectedCell.x;
          const fromY = selectedCell.y;
          const toX = cx;
          const toY = cy;
          const fromPiece = visualBoard.current?.[fromY]?.[fromX];
          const toPiece = visualBoard.current?.[toY]?.[toX];
          if (fromPiece && toPiece) {
            const nextBoard = visualBoard.current.map((row) => row.slice());
            nextBoard[fromY][fromX] = { ...toPiece, x: fromX, y: fromY };
            nextBoard[toY][toX] = { ...fromPiece, x: toX, y: toY };
            visualBoard.current = nextBoard;
          }

          socket.emit('game:action', {
            type: 'swap',
            from: { x: selectedCell.x, y: selectedCell.y },
            to: { x: cx, y: cy }
          });
          setSelectedCell(null);
        } else {
          setSelectedCell({ x: cx, y: cy });
        }
      } else {
        setSelectedCell(null);
      }
    }
  };

  const handleMouseMove = (e) => {
    syncMouse(e);
  };

  const handleMouseUp = (e) => {
    pointer.current.isDown = false;
    syncMouse(e);
  };

  return (
    <div
      className={mobileFullscreen ? "fixed inset-0 z-[120] bg-slate-950 p-1.5" : "space-y-8 animate-in fade-in duration-1000"}
      style={mobileFullscreen ? { direction: 'ltr', height: 'calc(var(--app-vh, 1vh) * 100)' } : { direction: 'ltr' }}
    >
      {!mobileFullscreen && (
      <div className="flex justify-between items-center bg-slate-900/50 p-6 rounded-[2rem] border border-slate-800 shadow-xl">
        <h1 className="text-4xl font-black text-white italic tracking-tighter uppercase leading-none">Miner<span className="text-primary">Games</span></h1>

        {activeGame && !isGameOver && (
          <div className="flex items-center gap-8">
            <div className="flex flex-col items-center">
              <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-1">Hash Score</span>
              <span className="text-white font-black text-2xl leading-none">{gameState?.score || 0}</span>
            </div>
            <div className="w-[1px] h-8 bg-white/10" />
            <div className="flex flex-col items-center">
              <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-1">Time Sync</span>
              <div className="flex items-center gap-2 text-primary font-black text-2xl leading-none"><Clock className="w-4 h-4" /><span>{timeLeft}s</span></div>
            </div>
            <button onClick={() => { 
              if (socket) socket.emit('game:end');
              setActiveGame(null); 
              setGameState(null); 
            }} className="bg-red-500/10 hover:bg-red-500/20 text-red-500 px-5 py-2.5 rounded-xl border border-red-500/20 font-black text-[10px] uppercase transition-all flex items-center gap-2 group"><RotateCcw className="w-3 h-3 group-hover:rotate-180 transition-transform" /> Abortar</button>
          </div>
        )}
      </div>
      )}

      {!activeGame ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
          <GameCard title="Memory Sync" description="Combine pares de moedas em alta velocidade." icon={Brain} color="from-blue-600 to-indigo-700" onClick={() => { if (!socketReady) return toast.error('Socket dos jogos desconectado.'); setIsGameOver(false); setRewardMessage(null); setGameState(null); setSelectedCell(null); setActiveGame('memory'); socket.emit('game:start', 'crypto-memory'); }} disabled={cooldowns.memory > 0 || !socketReady} cooldown={cooldowns.memory} />
          <GameCard title="Power Match" description="Gere cascatas de energia minerando ativos." icon={LayoutGrid} color="from-primary to-orange-700" onClick={() => { if (!socketReady) return toast.error('Socket dos jogos desconectado.'); setIsGameOver(false); setRewardMessage(null); setGameState(null); setSelectedCell(null); setActiveGame('match-3'); socket.emit('game:start', 'crypto-match-3'); }} disabled={cooldowns['match-3'] > 0 || !socketReady} cooldown={cooldowns['match-3']} />
        </div>
      ) : (
        <div className={mobileFullscreen ? "relative h-full flex items-center justify-center" : "relative"}>
          <div className={`bg-slate-900 border border-slate-800 shadow-2xl relative overflow-hidden flex flex-col items-center ${mobileFullscreen ? 'w-full h-full rounded-2xl p-2' : 'rounded-[3rem] p-4'}`}>
            {mobileFullscreen && (
              <div className="w-full flex items-center justify-between px-2 py-1.5 mb-2">
                <div className="flex items-center gap-3 text-white">
                  <span className="text-xs font-black uppercase tracking-widest">{activeGame === 'memory' ? 'Memory Sync' : 'Power Match'}</span>
                  <span className="text-primary font-black text-sm">{timeLeft}s</span>
                </div>
                <button
                  onClick={() => {
                    if (socket) socket.emit('game:end');
                    setActiveGame(null);
                    setGameState(null);
                    setSelectedCell(null);
                  }}
                  className="px-3 py-1.5 bg-red-500/15 hover:bg-red-500/25 text-red-300 rounded-lg border border-red-500/30 text-[10px] font-black uppercase tracking-wider"
                >
                  Sair
                </button>
              </div>
            )}
            {isGameOver ? (
              <div className={`flex flex-col items-center justify-center text-center space-y-6 sm:space-y-10 z-10 relative animate-in zoom-in duration-500 px-2 ${mobileFullscreen ? 'h-full py-4' : 'min-h-[min(550px,75dvh)] py-8 sm:py-0 sm:h-[550px]'}`}>
                <Trophy className="w-16 h-16 sm:w-24 sm:h-24 text-primary animate-bounce" />
                <h2 className="text-3xl sm:text-5xl md:text-7xl font-black text-white italic tracking-tighter uppercase leading-none">Relatório Final</h2>
                {rewardMessage ? <div className="p-12 bg-emerald-500/10 border border-emerald-500/20 rounded-[3rem] shadow-2xl backdrop-blur-md"><p className="text-emerald-400 font-black text-4xl uppercase">Bônus Concedido!</p><p className="text-emerald-400/70 font-bold mt-2 text-xl uppercase">{rewardMessage}</p></div> : <div className="p-10 bg-red-500/10 border border-red-500/20 rounded-[2rem]"><p className="text-red-400 font-black text-2xl uppercase tracking-widest">Missão Falhou</p></div>}
                <button 
                  onClick={() => socket.emit('game:start', activeGame === 'memory' ? 'crypto-memory' : 'crypto-match-3')} 
                  disabled={cooldowns[activeGame] > 0}
                  className={`px-20 py-7 bg-primary text-white font-black rounded-[2rem] hover:scale-105 transition-all uppercase italic tracking-widest shadow-glow text-xl ${cooldowns[activeGame] > 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {cooldowns[activeGame] > 0 ? `AGUARDE ${cooldowns[activeGame]}s` : 'REINICIAR LINK'}
                </button>
                <button onClick={() => { setActiveGame(null); setGameState(null); }} className="text-slate-500 font-bold uppercase text-xs tracking-[0.3em] hover:text-white transition-colors">Voltar ao Terminal</button>
              </div>
            ) : !gameState ? (
              <div className={`flex flex-col items-center justify-center gap-6 py-8 ${mobileFullscreen ? 'h-full' : 'min-h-[min(550px,70dvh)] sm:h-[550px]'}`}><div className="w-16 h-16 sm:w-24 sm:h-24 border-4 sm:border-8 border-primary border-t-transparent rounded-full animate-spin shadow-glow" /><p className="text-white font-black uppercase tracking-[0.3em] sm:tracking-[0.6em] animate-pulse text-xs sm:text-base text-center px-2">Sincronizando...</p></div>
            ) : (
              <div className={`relative w-full overflow-hidden bg-black shadow-inner ${mobileFullscreen ? 'rounded-xl flex-1 min-h-0 flex items-center justify-center p-1' : 'min-h-[280px] h-[min(500px,65dvh)] sm:h-[500px] rounded-2xl sm:rounded-[2.5rem]'}`}>
                <div className={mobileFullscreen ? "w-full max-w-[98vw] aspect-[8/5] max-h-full" : "w-full h-full"}>
                  <canvas ref={canvasRef} width={800} height={500} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onTouchStart={handleMouseDown} onTouchMove={handleMouseMove} onTouchEnd={handleMouseUp} className="w-full h-full object-contain" style={{ cursor: isMobileViewport ? 'default' : 'none' }} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function GameCard({ title, description, icon: Icon, color, onClick, disabled, cooldown }) {
  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={`group relative p-12 bg-slate-900 border border-slate-800 rounded-[4rem] text-left transition-all duration-500 overflow-hidden shadow-2xl ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary hover:-translate-y-4'}`}
    >
      <div className={`absolute -top-12 -right-12 w-72 h-72 bg-gradient-to-br ${color} opacity-10 blur-[90px] ${!disabled && 'group-hover:opacity-30'} transition-all duration-700`} />
      <div className={`w-28 h-28 rounded-[3rem] bg-gradient-to-br ${color} flex items-center justify-center mb-12 border border-white/10 shadow-2xl ${!disabled && 'group-hover:rotate-12'} transition-transform duration-500`}><Icon className="w-14 h-14 text-white" /></div>
      <h3 className="text-4xl font-black text-white mb-6 italic tracking-tighter uppercase leading-none">{title}</h3>
      <p className="text-slate-400 text-sm mb-12 leading-relaxed font-medium group-hover:text-slate-200 transition-colors">{description}</p>
      <div className="flex items-center gap-5 text-primary font-black text-xs uppercase tracking-[0.4em] transition-all duration-500 translate-y-6 group-hover:translate-y-0 opacity-0 group-hover:opacity-100">
        {disabled ? `COOLDOWN: ${cooldown}s` : <>LINK START <Play className="w-4 h-4 fill-current" /></>}
      </div>
    </button>
  );
}
