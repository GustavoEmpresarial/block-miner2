import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Cpu, Zap, Clock, History, BarChart3, ShieldCheck, Play, Pause, Loader2, AlertCircle, Trophy, CheckCircle2 } from 'lucide-react';
import { api } from '../store/auth';
import { formatHashrate } from '../utils/machine';
import { validateTrustedEvent, generateSecurityPayload } from '../utils/security';

export default function AutoMining() {
    const { t } = useTranslation();
    const [status, setStatus] = useState(null);
    const [availableGpus, setAvailableGpus] = useState([]);
    const [history, setHistory] = useState([]);
    const [isRunning, setIsRunning] = useState(false);
    const [countdown, setCountdown] = useState(300); // 5 minutes
    const [isLoading, setIsLoading] = useState(true);
    
    const timerRef = useRef(null);

    const fetchData = useCallback(async () => {
        try {
            const [statusRes, availableRes, historyRes] = await Promise.all([
                api.get('/auto-mining-gpu/active-reward'),
                api.get('/auto-mining-gpu/available'),
                api.get('/auto-mining-gpu/history')
            ]);

            if (statusRes.data.success) setStatus(statusRes.data);
            if (availableRes.data.success) setAvailableGpus(availableRes.data.data);
            if (historyRes.data.success) setHistory(historyRes.data.data);
        } catch (err) {
            console.error("Failed to fetch auto mining data", err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const claimGPU = async (gpuId) => {
        try {
            const res = await api.post('/auto-mining-gpu/claim', { gpu_id: gpuId });
            if (res.data.success) {
                toast.success("Hardware resgatado e instalado!");
                fetchData();
                return true;
            }
        } catch (err) {
            toast.error(err.response?.data?.error || "Falha no resgate automático.");
            setIsRunning(false);
        }
        return false;
    };

    const processAutoClaim = useCallback(async () => {
        if (availableGpus.length > 0) {
            const success = await claimGPU(availableGpus[0].id);
            if (success) setCountdown(300);
        } else {
            setCountdown(300);
            fetchData();
        }
    }, [availableGpus, fetchData]);

    // Heartbeat to sync time with server (anti-cheat + focus check)
    useEffect(() => {
        let heartbeatInterval;
        if (isRunning && !document.hidden) {
            heartbeatInterval = setInterval(async () => {
                try {
                    const security = generateSecurityPayload();
                    await api.post('/session/heartbeat', { 
                        type: 'auto-mining',
                        security
                    });
                } catch (err) {
                    console.error("Heartbeat sync failed");
                }
            }, 10000); // sync every 10s
        }
        return () => clearInterval(heartbeatInterval);
    }, [isRunning]);

    useEffect(() => {
        if (isRunning && !document.hidden) {
            timerRef.current = setInterval(() => {
                setCountdown(prev => {
                    if (prev <= 1) {
                        processAutoClaim();
                        return 300;
                    }
                    return prev - 1;
                });
            }, 1000);
        } else {
            clearInterval(timerRef.current);
        }
        return () => clearInterval(timerRef.current);
    }, [isRunning, processAutoClaim]);

    const handleToggleSystem = (e) => {
        if (!validateTrustedEvent(e)) return;
        setIsRunning(!isRunning);
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const stats = status?.stats || {};
    const dailyProgress = stats.dailyLimit ? (stats.claims24h / stats.dailyLimit) * 100 : 0;

    if (isLoading) return (
        <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Sincronizando Hardware...</p>
        </div>
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-700 pb-20">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <div className="inline-flex p-3 bg-primary/10 rounded-2xl">
                        <Cpu className="w-6 h-6 text-primary" />
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tight uppercase italic">Auto Mining GPU</h1>
                    <p className="text-gray-500 font-medium">Mantenha esta página aberta para resgate automático de hardware.</p>
                </div>
                <div className="bg-slate-900/50 px-4 py-2 rounded-xl border border-slate-800 flex items-center gap-2 shadow-glow-sm">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400 font-black text-[10px] uppercase tracking-widest">Sessão Segura Ativa</span>
                </div>
            </div>

            {!status?.data && (
                <div className="bg-amber-500/10 border border-amber-500/20 p-6 rounded-[2rem] flex items-center gap-4 animate-pulse">
                    <AlertCircle className="w-8 h-8 text-amber-500" />
                    <div>
                        <h4 className="text-amber-500 font-black uppercase text-xs tracking-widest">Atenção: Sistema de Recompensas Offline</h4>
                        <p className="text-amber-200/60 text-[10px] font-bold uppercase mt-1">O administrador precisa rodar o script de semente (seed) para ativar as GPUs.</p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    {/* Main Auto Miner Card */}
                    <div className="bg-surface border border-gray-800/50 rounded-[3rem] p-10 shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-bl-[120px] -mr-20 -mt-20 group-hover:bg-primary/10 transition-colors" />
                        
                        <div className="relative z-10 space-y-10 text-center md:text-left">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                                <div className="space-y-4">
                                    <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter">⚡ Auto GPU Claim</h2>
                                    <p className="text-sm text-gray-500 font-medium leading-relaxed max-w-sm">
                                        Seu hardware será resgatado automaticamente a cada 5 minutos. Mantenha esta página aberta para minerar!
                                    </p>
                                </div>

                                <div className="flex flex-col items-center gap-4">
                                    <div className="relative w-40 h-40 flex items-center justify-center">
                                        <svg className="w-full h-full -rotate-90">
                                            <circle cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-gray-800" />
                                            <circle 
                                                cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="8" fill="transparent" 
                                                className="text-primary transition-all duration-1000 ease-linear"
                                                strokeDasharray={440}
                                                strokeDashoffset={440 - (440 * countdown) / 300}
                                            />
                                        </svg>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                                            <span className="text-4xl font-black text-white italic">{formatTime(countdown)}</span>
                                            <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest mt-1">Próximo Resgate</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col md:flex-row items-center gap-6">
                                <button
                                    onClick={handleToggleSystem}
                                    disabled={!status?.data}
                                    className={`w-full md:w-auto px-12 py-5 rounded-[2rem] font-black text-xs uppercase tracking-widest transition-all shadow-xl flex items-center justify-center gap-3 italic ${isRunning
                                            ? 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20'
                                            : 'bg-primary text-white shadow-primary/20 hover:scale-105 active:scale-95 disabled:opacity-20'
                                        }`}
                                >
                                    {isRunning ? <><Pause className="w-4 h-4 fill-current" /> Pausar Sistema</> : <><Play className="w-4 h-4 fill-current" /> Iniciar Sistema</>}
                                </button>

                                <div className="flex items-center gap-3 text-emerald-500 bg-emerald-500/5 px-6 py-4 rounded-2xl border border-emerald-500/10">
                                    {availableGpus.length > 0 ? (
                                        <>
                                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                                            <span className="text-[10px] font-black uppercase tracking-widest">{availableGpus.length} GPU(s) Disponível(is)</span>
                                        </>
                                    ) : (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin text-gray-600" />
                                            <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest italic">Aguardando liberação de GPU...</span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Available Rewards Grid */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 px-2">
                            <Zap className="w-5 h-5 text-primary" />
                            <h3 className="text-lg font-black text-white uppercase italic tracking-tighter">Available Rewards</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {availableGpus.length === 0 ? (
                                <div className="col-span-full py-12 flex flex-col items-center justify-center bg-gray-950/50 rounded-[2rem] border border-dashed border-gray-800">
                                    <Clock className="w-8 h-8 text-gray-700 mb-2" />
                                    <p className="text-gray-600 font-bold uppercase text-[10px] tracking-widest italic">Nenhum hardware liberado no momento</p>
                                </div>
                            ) : availableGpus.map(gpu => (
                                <div key={gpu.id} className="bg-surface border border-gray-800 p-6 rounded-[2rem] flex items-center justify-between group hover:border-primary/30 transition-all">
                                    <div className="flex items-center gap-4">
                                        <div className="w-14 h-14 bg-gray-900 rounded-2xl flex items-center justify-center border border-gray-800 group-hover:scale-110 transition-transform">
                                            <Cpu className="w-7 h-7 text-primary" />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-black text-white uppercase italic">{gpu.reward?.name || "Pulse GPU v1"}</h4>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Power: {formatHashrate(gpu.gpuHashRate)}</span>
                                                <span className="w-1 h-1 rounded-full bg-gray-700" />
                                                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Slots: 1</span>
                                            </div>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={(e) => {
                                            if (!validateTrustedEvent(e)) return;
                                            claimGPU(gpu.id);
                                        }}
                                        className="px-4 py-2 bg-emerald-500 text-white font-black text-[9px] uppercase tracking-widest rounded-xl hover:bg-emerald-400 active:scale-95 transition-all shadow-glow-emerald"
                                    >
                                        Resgatar Agora
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="space-y-8">
                    {/* Reward Tracker Stats */}
                    <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-8 shadow-xl space-y-8 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-6 opacity-5">
                            <BarChart3 className="w-20 h-20 text-primary" />
                        </div>
                        
                        <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] flex items-center gap-2">
                            <BarChart3 className="w-4 h-4 text-primary" /> Performance Data
                        </h3>

                        <div className="space-y-6">
                            <TrackerBox label="Claims (24h)" value={stats.claims24h || 0} icon={History} color="blue" />
                            <TrackerBox label="Hash granted (24h)" value={formatHashrate(stats.hash24h || 0)} icon={Zap} color="emerald" />
                            
                            <div className="space-y-3 pt-4 border-t border-gray-800/50">
                                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                                    <span className="text-gray-500 italic">Daily Limit Progress</span>
                                    <span className="text-primary">{dailyProgress.toFixed(1)}%</span>
                                </div>
                                <div className="w-full h-2 bg-gray-900 rounded-full overflow-hidden border border-white/5 shadow-inner">
                                    <div 
                                        className="h-full bg-gradient-to-r from-primary to-blue-500 transition-all duration-1000" 
                                        style={{ width: `${Math.min(100, dailyProgress)}%` }}
                                    ></div>
                                </div>
                                <p className="text-[8px] text-gray-600 font-bold uppercase tracking-widest text-center">Limit: {stats.dailyLimit} claims / day</p>
                            </div>

                            <div className="h-[1px] bg-gray-800 w-full" />

                            <TrackerBox label="Total Claims" value={stats.claimsTotal || 0} icon={ShieldCheck} color="purple" />
                            <TrackerBox label="Lifetime Hash" value={formatHashrate(stats.hashTotal || 0)} icon={Trophy} color="amber" />
                        </div>
                    </div>

                    {/* Recent Claims List */}
                    <div className="bg-gray-950/50 border border-gray-800 rounded-[2.5rem] p-8 shadow-xl space-y-6">
                        <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] flex items-center gap-2">
                            <History className="w-3 h-3" /> Recent Claims
                        </h3>
                        <div className="space-y-4 max-h-[400px] overflow-y-auto scrollbar-hide pr-1">
                            {history.length === 0 ? (
                                <p className="text-[10px] text-gray-700 font-black uppercase text-center py-8 italic tracking-widest">No recent data available</p>
                            ) : history.map((log, idx) => (
                                <div key={idx} className="flex items-center justify-between p-4 bg-gray-900/50 rounded-2xl border border-gray-800/50 hover:border-gray-700 transition-all">
                                    <div className="space-y-1">
                                        <p className="text-[9px] font-black text-white italic">{new Date(log.claimedAt).toLocaleString()}</p>
                                        <p className="text-[8px] font-bold text-gray-600 uppercase tracking-widest">{log.reward?.name || "Pulse GPU v1"}</p>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-[10px] font-black text-emerald-400">+{formatHashrate(log.gpuHashRate)}</span>
                                        <span className="text-[7px] font-bold text-gray-700 uppercase tracking-tighter">verified</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function TrackerBox({ label, value, icon: Icon, color }) {
    const colors = {
        blue: 'text-blue-400 bg-blue-500/10',
        emerald: 'text-emerald-400 bg-emerald-500/10',
        purple: 'text-purple-400 bg-purple-500/10',
        amber: 'text-amber-400 bg-amber-500/10',
    };
    return (
        <div className="flex items-center justify-between group">
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${colors[color]} group-hover:scale-110 transition-transform`}>
                    <Icon className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{label}</span>
            </div>
            <span className="text-sm font-black text-white italic">{value}</span>
        </div>
    );
}
