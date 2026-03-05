import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Youtube, Play, Pause, Zap, Clock, TrendingUp, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../store/auth';

export default function YouTubeWatch() {
    const { t } = useTranslation();
    const [url, setUrl] = useState('');
    const [videoId, setVideoId] = useState(null);
    const [isRunning, setIsRunning] = useState(false);
    const [countdown, setCountdown] = useState(60);
    const [status, setStatus] = useState(null);
    const [stats, setStats] = useState(null);
    
    const timerRef = useRef(null);

    const extractVideoId = (input) => {
        const raw = String(input || "").trim();
        const idPattern = /^[a-zA-Z0-9_-]{11}$/;
        if (idPattern.test(raw)) return raw;
        try {
            const urlObj = new URL(raw);
            const host = urlObj.hostname.replace(/^www\./, "").toLowerCase();
            if (host === "youtu.be") return urlObj.pathname.split("/")[1];
            if (host === "youtube.com" || host === "m.youtube.com") {
                if (urlObj.pathname === "/watch") return urlObj.searchParams.get("v");
                if (urlObj.pathname.startsWith("/embed/")) return urlObj.pathname.split("/")[2];
            }
        } catch { return null; }
        return null;
    };

    const fetchStatus = useCallback(async () => {
        try {
            const res = await api.get('/games/youtube/status');
            if (res.data.ok) {
                setStatus(res.data);
                if (res.data.nextClaimInSeconds > 0) {
                    setCountdown(res.data.nextClaimInSeconds);
                }
            }
        } catch (err) { console.error(err); }
    }, []);

    const fetchUserStats = useCallback(async () => {
        try {
            const res = await api.get('/games/youtube/stats');
            if (res.data.ok) setStats(res.data);
        } catch (err) { console.error(err); }
    }, []);

    useEffect(() => {
        fetchStatus();
        fetchUserStats();
    }, [fetchStatus, fetchUserStats]);

    const handleLoadVideo = () => {
        const id = extractVideoId(url);
        if (id) {
            setVideoId(id);
            toast.success('Vídeo carregado com sucesso!');
        } else {
            toast.error('URL do YouTube inválida.');
        }
    };

    const claimReward = async () => {
        try {
            const res = await api.post('/games/youtube/claim', { videoId });
            if (res.data.ok) {
                toast.success(`+${res.data.rewardGh.toFixed(2)} GH/s aplicado!`);
                setCountdown(60);
                fetchStatus();
                fetchUserStats();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Falha no resgate.');
            setIsRunning(false);
        }
    };

    useEffect(() => {
        if (isRunning && !document.hidden) {
            timerRef.current = setInterval(() => {
                setCountdown(prev => {
                    if (prev <= 1) {
                        claimReward();
                        return 60;
                    }
                    return prev - 1;
                });
            }, 1000);
        } else {
            clearInterval(timerRef.current);
        }
        return () => clearInterval(timerRef.current);
    }, [isRunning, videoId]);

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <div className="inline-flex p-3 bg-red-500/10 rounded-2xl">
                        <Youtube className="w-6 h-6 text-red-500" />
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tight">{t('youtube.title')}</h1>
                    <p className="text-gray-500 font-medium">{t('youtube.subtitle')}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Video Area */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-8 shadow-xl">
                        <div className="flex gap-4 mb-8">
                            <input 
                                type="text" 
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="Cole a URL do vídeo do YouTube aqui..." 
                                className="flex-1 bg-gray-900/50 border border-gray-800 rounded-2xl py-4 px-6 text-gray-200 text-sm focus:outline-none focus:border-primary/50 transition-all"
                            />
                            <button 
                                onClick={handleLoadVideo}
                                className="px-8 bg-primary hover:bg-primary-hover text-white rounded-2xl font-bold text-sm transition-all"
                            >
                                Carregar
                            </button>
                        </div>

                        <div className="aspect-video bg-gray-900 rounded-[2rem] overflow-hidden border border-gray-800 relative group">
                            {videoId ? (
                                <iframe
                                    className="w-full h-full"
                                    src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
                                    title="YouTube video player"
                                    frameBorder="0"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                ></iframe>
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600">
                                    <Youtube className="w-20 h-20 mb-4 opacity-20" />
                                    <p className="font-bold uppercase tracking-widest text-xs">Aguardando vídeo...</p>
                                </div>
                            )}
                        </div>

                        <div className="mt-8 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <button 
                                    onClick={() => setIsRunning(!isRunning)}
                                    disabled={!videoId}
                                    className={`flex items-center gap-2 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${
                                        isRunning 
                                            ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20' 
                                            : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-30'
                                    }`}
                                >
                                    {isRunning ? <><Pause className="w-4 h-4 fill-current" /> Pausar Ganho</> : <><Play className="w-4 h-4 fill-current" /> Iniciar Ganho</>}
                                </button>
                                {isRunning && (
                                    <div className="flex items-center gap-3 px-6 py-4 bg-gray-800/50 rounded-2xl border border-gray-700/50">
                                        <Clock className="w-4 h-4 text-primary animate-pulse" />
                                        <span className="text-sm font-bold text-white">Próximo Ganho em {countdown}s</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Stats Sidebar */}
                <div className="space-y-6">
                    <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-8 shadow-xl">
                        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-[0.2em] mb-8">Seu Desempenho</h3>
                        <div className="space-y-6">
                            <StatBox label="Hash YouTube Ativo" value={`${Number(status?.activeHashRate || 0).toFixed(2)} GH/s`} icon={Zap} color="red" />
                            <StatBox label="Recompensa p/ Minuto" value={`+${Number(status?.rewardGh || 0).toFixed(2)} GH/s`} icon={TrendingUp} color="emerald" />
                            <StatBox label="Duração do Bônus" value="60 min" icon={Clock} color="blue" />
                        </div>
                    </div>

                    <div className="bg-gray-800/30 border border-gray-800 rounded-[2rem] p-6 space-y-4">
                        <div className="flex items-center justify-between text-[10px] font-black text-slate-500 uppercase">
                            <span>Resgates (24h)</span>
                            <span className="text-white">{stats?.claims24h || 0}</span>
                        </div>
                        <div className="w-full h-1 bg-gray-900 rounded-full overflow-hidden">
                            <div className="h-full bg-red-500" style={{ width: '45%' }}></div>
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-black text-slate-500 uppercase">
                            <span>Hash Total Ganho</span>
                            <span className="text-white">{Number(stats?.hashGrantedTotal || 0).toFixed(2)} GH/s</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatBox({ label, value, icon: Icon, color }) {
    const colors = {
        red: 'text-red-500 bg-red-500/10',
        emerald: 'text-emerald-500 bg-emerald-500/10',
        blue: 'text-blue-500 bg-blue-500/10',
    };
    return (
        <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl ${colors[color]}`}>
                <Icon className="w-5 h-5" />
            </div>
            <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</p>
                <p className="text-lg font-black text-white">{value}</p>
            </div>
        </div>
    );
}
