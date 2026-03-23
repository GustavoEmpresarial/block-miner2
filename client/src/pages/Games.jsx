import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuthStore } from '../store/auth';
import { Brain, LayoutGrid, Trophy, Clock, Zap, RotateCcw, Play, Fingerprint, MousePointer2 } from 'lucide-react';
import { toast } from 'sonner';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const CRYPTO_ICONS = {
  'bitcoin': 'https://cryptologos.cc/logos/bitcoin-btc-logo.svg',
  'ethereum': 'https://cryptologos.cc/logos/ethereum-eth-logo.svg',
  'solana': 'https://cryptologos.cc/logos/solana-sol-logo.svg',
  'binance-coin': 'https://cryptologos.cc/logos/bnb-bnb-logo.svg',
  'cardano': 'https://cryptologos.cc/logos/cardano-ada-logo.svg',
  'polkadot': 'https://cryptologos.cc/logos/polkadot-new-dot-logo.svg',
  'dogecoin': 'https://cryptologos.cc/logos/dogecoin-doge-logo.svg',
  'polygon': 'https://cryptologos.cc/logos/polygon-matic-logo.svg'
};

const ICON_IMAGES = {};
Object.entries(CRYPTO_ICONS).forEach(([k, v]) => { const img = new Image(); img.src = v; ICON_IMAGES[k] = img; });

export default function Games() {
  const { token } = useAuthStore();
  const [socket, setSocket] = useState(null);
  const [activeGame, setActiveGame] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [isGameOver, setIsGameOver] = useState(false);
  const [rewardMessage, setRewardMessage] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragInfo, setDragInfo] = useState(null);

  // High Precision Engine States
  const canvasRef = useRef(null);
  const gameLoopRef = useRef(null);
  const particles = useRef([]);
  const visualBoard = useRef([]);
  const pointer = useRef({ x: 400, y: 250, isDown: false });

  useEffect(() => {
    const newSocket = io(SOCKET_URL, { auth: { token }, withCredentials: true });

    newSocket.on('game:error', (msg) => {
      toast.error(msg);
      setIsProcessing(false);
    });

    newSocket.on('game:started', (data) => {
      setGameState(data); setIsGameOver(false); setRewardMessage(null); setIsProcessing(false);
      particles.current = [];
      if (data.game === 'crypto-match-3' && data.board) {
        visualBoard.current = data.board.map((row, y) => row.map((s, x) => ({ symbol: s, x, y, visualX: x, visualY: y })));
      }
      setTimeLeft(data.game === 'crypto-memory' ? 60 : 180);
    });

    newSocket.on('game:card_flipped', (data) => {
      setGameState(prev => { if (!prev || !prev.board) return prev; return { ...prev, board: prev.board.map(c => c.id === data.id ? { ...c, symbol: data.symbol, isFlipped: true, flipAnim: 0 } : c) }; });
    });

    newSocket.on('game:match', (data) => {
      setGameState(prev => { if (!prev || !prev.board) return prev; return { ...prev, score: data.score, board: prev.board.map(c => data.ids.includes(c.id) ? { ...c, isMatched: true } : c) }; });
      createExplosion(400, 250);
    });

    newSocket.on('game:mismatch', (data) => {
      setIsProcessing(true);
      setTimeout(() => {
        setGameState(prev => { if (!prev || !prev.board) return prev; return { ...prev, board: prev.board.map(c => data.ids.includes(c.id) ? { ...c, isFlipped: false, symbol: null } : c) }; });
        setIsProcessing(false);
      }, 800);
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
      setCooldown(60);
      if (data.success) {
        setRewardMessage(data.reward);
        toast.success(data.reward);
      } else toast.error(data.message);
    });

    setSocket(newSocket);
    return () => newSocket.disconnect();
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
    if (cooldown > 0) {
      const timer = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
      return () => clearInterval(timer);
    }
  }, [cooldown]);

  const createExplosion = (x, y) => {
    for (let i = 0; i < 25; i++) {
      particles.current.push({ x, y, vx: (Math.random() - 0.5) * 12, vy: (Math.random() - 0.5) * 12, life: 1.0, color: '#3b82f6', size: Math.random() * 5 + 2 });
    }
  };

  useEffect(() => {
    if (!activeGame || !gameState || isGameOver) return;
    const render = () => {
      const canvas = canvasRef.current; if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, 800, 500);

      // Cyberpunk BG
      ctx.fillStyle = '#020617'; ctx.fillRect(0, 0, 800, 500);
      ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1;
      for (let i = 0; i < 800; i += 50) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 500); ctx.stroke(); }
      for (let i = 0; i < 500; i += 50) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(800, i); ctx.stroke(); }

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

      // --- CUSTOM VIRTUAL CURSOR (Cyberpunk Mira) ---
      const mx = pointer.current.x;
      const my = pointer.current.y;
      ctx.strokeStyle = pointer.current.isDown ? '#ef4444' : '#3b82f6';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 10; ctx.shadowColor = ctx.strokeStyle;

      // Circular scope
      ctx.beginPath(); ctx.arc(mx, my, 12, 0, Math.PI * 2); ctx.stroke();
      // Crosshair lines
      ctx.beginPath(); ctx.moveTo(mx - 18, my); ctx.lineTo(mx + 18, my); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx, my - 18); ctx.lineTo(mx, my + 18); ctx.stroke();
      // Dot center
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath(); ctx.arc(mx, my, 2, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;

      gameLoopRef.current = requestAnimationFrame(render);
    };
    gameLoopRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(gameLoopRef.current);
  }, [activeGame, gameState, isGameOver, dragInfo]);

  const drawMemory = (ctx, state) => {
    if (!state.board) return;
    const cols = 4, padding = 20, size = 100;
    const sx = (800 - (cols * (size + padding))) / 2, sy = (500 - (4 * (size + padding))) / 2;
    state.board.forEach((card, i) => {
      const x = sx + (i % cols) * (size + padding), y = sy + Math.floor(i / cols) * (size + padding);
      ctx.save(); ctx.translate(x + size / 2, y + size / 2);
      let sX = 1.0;
      if (card.isFlipped || card.isMatched) {
        card.flipAnim = Math.min(1, (card.flipAnim || 0) + 0.15);
        sX = Math.cos(card.flipAnim * Math.PI / 2);
        if (card.flipAnim > 0.5) sX = -Math.sin(card.flipAnim * Math.PI / 2);
      }
      ctx.scale(sX, 1);
      ctx.fillStyle = (card.isFlipped || card.isMatched) ? '#2563eb' : '#1e293b';
      if (card.isMatched) ctx.fillStyle = '#059669';
      ctx.shadowBlur = 15; ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.roundRect(-size / 2, -size / 2, size, size, 16); ctx.fill();
      if (Math.abs(sX) > 0.1 && (card.isFlipped || card.isMatched)) {
        const img = ICON_IMAGES[card.symbol];
        if (img && img.complete) { ctx.scale(-1, 1); ctx.drawImage(img, -size / 3, -size / 3, size / 1.5, size / 1.5); }
      }
      ctx.restore();
    });
  };

  const drawMatch3 = (ctx, state) => {
    if (!visualBoard.current.length) return;
    const s = 50, p = 8;
    const sx = (800 - (8 * (s + p))) / 2, sy = (500 - (8 * (s + p))) / 2;
    visualBoard.current.forEach((row, y) => {
      row.forEach((piece, x) => {
        piece.visualY += (y - piece.visualY) * 0.15; piece.visualX += (x - piece.visualX) * 0.15;
        if (dragInfo && dragInfo.cx === x && dragInfo.cy === y) return;
        const px = sx + piece.visualX * (s + p), py = sy + piece.visualY * (s + p);
        ctx.fillStyle = 'rgba(30, 41, 59, 0.6)'; ctx.beginPath(); ctx.roundRect(sx + x * (s + p), sy + y * (s + p), s, s, 12); ctx.fill();
        const img = ICON_IMAGES[piece.symbol];
        if (img && img.complete) {
          ctx.save(); ctx.translate(px + s / 2, py + s / 2);
          ctx.scale(-1, 1); ctx.drawImage(img, -s / 2 + 10, -s / 2 + 10, s - 20, s - 20);
          ctx.restore();
        }
      });
    });
    if (dragInfo && state.board) {
      const symbol = state.board[dragInfo.cy]?.[dragInfo.cx];
      if (symbol) {
        const img = ICON_IMAGES[symbol];
        if (img && img.complete) {
          ctx.save(); ctx.shadowBlur = 30; ctx.shadowColor = '#3b82f6';
          ctx.translate(dragInfo.mX, dragInfo.mY); ctx.scale(-1.2, 1.2);
          ctx.drawImage(img, -s / 2 + 10, -s / 2 + 10, s - 20, s - 20);
          ctx.restore();
        }
      }
    }
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
      const p = 20, s = 100, sx = (800 - (4 * (s + p))) / 2, sy = (500 - (4 * (s + p))) / 2;
      const col = Math.floor((x - sx) / (s + p)), row = Math.floor((y - sy) / (s + p));
      if (col >= 0 && col < 4 && row >= 0 && row < 4) {
        const lx = (x - sx) % (s + p), ly = (y - sy) % (s + p);
        if (lx < s && ly < s) socket.emit('game:action', { type: 'flip', cardId: row * 4 + col });
      }
    } else if (activeGame === 'match-3') {
      const s = 50, p = 8, sx = (800 - (8 * (s + p))) / 2, sy = (500 - (8 * (s + p))) / 2;
      const cx = Math.floor((x - sx) / (s + p)), cy = Math.floor((y - sy) / (s + p));
      if (cx >= 0 && cx < 8 && cy >= 0 && cy < 8) setDragInfo({ cx, cy, mX: x, mY: y });
    }
  };

  const handleMouseMove = (e) => {
    const { x, y } = syncMouse(e);
    if (dragInfo) setDragInfo(p => ({ ...p, mX: x, mY: y }));
  };

  const handleMouseUp = (e) => {
    pointer.current.isDown = false;
    if (activeGame === 'match-3' && dragInfo) {
      const { x, y } = syncMouse(e);
      const s = 50, p = 8, sx = (800 - (8 * (s + p))) / 2, sy = (500 - (8 * (s + p))) / 2;
      const cx = Math.floor((x - sx) / (s + p)), cy = Math.floor((y - sy) / (s + p));
      if (cx >= 0 && cx < 8 && cy >= 0 && cy < 8) {
        const dx = Math.abs(cx - dragInfo.cx), dy = Math.abs(cy - dragInfo.cy);
        if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) socket.emit('game:action', { type: 'swap', from: { x: dragInfo.cx, y: dragInfo.cy }, to: { x: cx, y: cy } });
      }
      setDragInfo(null);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-1000" style={{ direction: 'ltr' }}>
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

      {!activeGame ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <GameCard title="Memory Sync" description="Combine pares de moedas em alta velocidade." icon={Brain} color="from-blue-600 to-indigo-700" onClick={() => { setActiveGame('memory'); socket.emit('game:start', 'crypto-memory'); }} disabled={cooldown > 0} cooldown={cooldown} />
          <GameCard title="Power Match" description="Gere cascatas de energia minerando ativos." icon={LayoutGrid} color="from-primary to-orange-700" onClick={() => { setActiveGame('match-3'); socket.emit('game:start', 'crypto-match-3'); }} disabled={cooldown > 0} cooldown={cooldown} />
        </div>
      ) : (
        <div className="relative">
          <div className="bg-slate-900 border border-slate-800 rounded-[3rem] p-4 shadow-2xl relative overflow-hidden flex flex-col items-center">
            {isGameOver ? (
              <div className="min-h-[min(550px,75dvh)] py-8 sm:py-0 sm:h-[550px] flex flex-col items-center justify-center text-center space-y-6 sm:space-y-10 z-10 relative animate-in zoom-in duration-500 px-2">
                <Trophy className="w-16 h-16 sm:w-24 sm:h-24 text-primary animate-bounce" />
                <h2 className="text-3xl sm:text-5xl md:text-7xl font-black text-white italic tracking-tighter uppercase leading-none">Relatório Final</h2>
                {rewardMessage ? <div className="p-12 bg-emerald-500/10 border border-emerald-500/20 rounded-[3rem] shadow-2xl backdrop-blur-md"><p className="text-emerald-400 font-black text-4xl uppercase">Bônus Concedido!</p><p className="text-emerald-400/70 font-bold mt-2 text-xl uppercase">{rewardMessage}</p></div> : <div className="p-10 bg-red-500/10 border border-red-500/20 rounded-[2rem]"><p className="text-red-400 font-black text-2xl uppercase tracking-widest">Missão Falhou</p></div>}
                <button 
                  onClick={() => socket.emit('game:start', activeGame === 'memory' ? 'crypto-memory' : 'crypto-match-3')} 
                  disabled={cooldown > 0}
                  className={`px-20 py-7 bg-primary text-white font-black rounded-[2rem] hover:scale-105 transition-all uppercase italic tracking-widest shadow-glow text-xl ${cooldown > 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {cooldown > 0 ? `AGUARDE ${cooldown}s` : 'REINICIAR LINK'}
                </button>
                <button onClick={() => { setActiveGame(null); setGameState(null); }} className="text-slate-500 font-bold uppercase text-xs tracking-[0.3em] hover:text-white transition-colors">Voltar ao Terminal</button>
              </div>
            ) : !gameState ? (
              <div className="min-h-[min(550px,70dvh)] sm:h-[550px] flex flex-col items-center justify-center gap-6 py-8"><div className="w-16 h-16 sm:w-24 sm:h-24 border-4 sm:border-8 border-primary border-t-transparent rounded-full animate-spin shadow-glow" /><p className="text-white font-black uppercase tracking-[0.3em] sm:tracking-[0.6em] animate-pulse text-xs sm:text-base text-center px-2">Sincronizando...</p></div>
            ) : (
              <div className="relative w-full min-h-[280px] h-[min(500px,65dvh)] sm:h-[500px] rounded-2xl sm:rounded-[2.5rem] overflow-hidden bg-black shadow-inner">
                <canvas ref={canvasRef} width={800} height={500} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onTouchStart={handleMouseDown} onTouchMove={handleMouseMove} onTouchEnd={handleMouseUp} className="w-full h-full object-contain" style={{ cursor: 'none' }} />
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
