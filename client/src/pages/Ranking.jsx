import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, Zap, Cpu, Gamepad2, RefreshCw, ChevronRight, Crown, Medal } from 'lucide-react';
import { api } from '../store/auth';

export default function Ranking() {
    const { t } = useTranslation();
    const [ranking, setRanking] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const formatHashrate = (value) => {
        const safeValue = Number(value || 0);
        if (!Number.isFinite(safeValue)) return "0 H/s";
        const units = ["H/s", "KH/s", "MH/s", "GH/s", "TH/s"];
        let scaled = safeValue;
        let unitIndex = 0;
        while (scaled >= 1000 && unitIndex < units.length - 1) {
            scaled /= 1000;
            unitIndex += 1;
        }
        const precision = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
        return `${scaled.toFixed(precision)} ${units[unitIndex]}`;
    };

    const fetchRanking = useCallback(async () => {
        try {
            setIsLoading(true);
            const res = await api.get('/ranking?limit=50');
            if (res.data.ok) {
                setRanking(res.data.ranking);
            }
        } catch (err) {
            console.error("Erro ao buscar ranking", err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRanking();
    }, [fetchRanking]);

    return (
        <div className="space-y-8 animate-in fade-in duration-700 pb-20">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <div className="inline-flex p-3 bg-amber-500/10 rounded-2xl">
                        <Trophy className="w-6 h-6 text-amber-500" />
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tight">Hall da Fama</h1>
                    <p className="text-gray-500 font-medium">Os mineradores mais poderosos da rede global.</p>
                </div>
                <button
                    onClick={fetchRanking}
                    className="p-3 bg-gray-800/50 hover:bg-gray-800 text-gray-400 hover:text-white rounded-xl transition-all border border-gray-700/50"
                >
                    <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Top 3 Spotlight */}
            {!isLoading && ranking.length >= 3 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                    {/* Rank 2 */}
                    <div className="order-2 md:order-1 bg-surface border border-gray-800/50 rounded-[2.5rem] p-8 text-center space-y-4 h-[300px] flex flex-col justify-center relative overflow-hidden group">
                        <div className="absolute top-0 inset-x-0 h-1 bg-slate-400 opacity-20" />
                        <div className="relative z-10">
                            <div className="w-16 h-16 bg-slate-400/10 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-slate-400/20">
                                <Medal className="w-8 h-8 text-slate-400" />
                            </div>
                            <h3 className="text-xl font-black text-white truncate px-4">{ranking[1].username}</h3>
                            <p className="text-primary font-bold text-lg">{formatHashrate(ranking[1].totalHashRate)}</p>
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">2º LUGAR</span>
                        </div>
                    </div>

                    {/* Rank 1 */}
                    <div className="order-1 md:order-2 bg-gradient-to-b from-amber-500/10 to-surface border border-amber-500/30 rounded-[3rem] p-10 text-center space-y-6 h-[360px] flex flex-col justify-center relative overflow-hidden shadow-2xl shadow-amber-500/5 group">
                        <div className="absolute top-0 inset-x-0 h-1.5 bg-amber-500 shadow-glow" />
                        <div className="relative z-10">
                            <div className="w-24 h-24 bg-amber-500 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-amber-500/20 shadow-xl group-hover:scale-110 transition-transform duration-500">
                                <Crown className="w-12 h-12 text-slate-950" />
                            </div>
                            <h3 className="text-2xl font-black text-white truncate px-4">{ranking[0].username}</h3>
                            <p className="text-amber-500 font-black text-2xl">{formatHashrate(ranking[0].totalHashRate)}</p>
                            <span className="text-xs font-black text-amber-500/50 uppercase tracking-[0.3em]">REI DO BLOCO</span>
                        </div>
                    </div>

                    {/* Rank 3 */}
                    <div className="order-3 md:order-3 bg-surface border border-gray-800/50 rounded-[2.5rem] p-8 text-center space-y-4 h-[300px] flex flex-col justify-center relative overflow-hidden group">
                        <div className="absolute top-0 inset-x-0 h-1 bg-orange-700/20" />
                        <div className="relative z-10">
                            <div className="w-16 h-16 bg-orange-700/10 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-orange-700/20">
                                <Medal className="w-8 h-8 text-orange-700" />
                            </div>
                            <h3 className="text-xl font-black text-white truncate px-4">{ranking[2].username}</h3>
                            <p className="text-primary font-bold text-lg">{formatHashrate(ranking[2].totalHashRate)}</p>
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">3º LUGAR</span>
                        </div>
                    </div>
                </div>
            )}

            {/* List Table */}
            <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-400">
                        <thead className="bg-gray-800/30 text-[10px] uppercase font-bold tracking-widest text-gray-500">
                            <tr>
                                <th className="px-8 py-6 w-20">Rank</th>
                                <th className="px-8 py-6">Minerador</th>
                                <th className="px-8 py-6">HashRate Total</th>
                                <th className="px-8 py-6 hidden md:table-cell">Sala de Mineração</th>
                                <th className="px-8 py-6 hidden md:table-cell">Games/Social</th>
                                <th className="px-8 py-6 text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/50 font-medium">
                            {isLoading ? (
                                Array.from({ length: 10 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan="6" className="px-8 py-6 bg-gray-800/10" />
                                    </tr>
                                ))
                            ) : ranking.map((entry, i) => (
                                <tr key={i} className={`hover:bg-primary/5 transition-colors group ${i < 3 ? 'bg-primary/5' : ''}`}>
                                    <td className="px-8 py-6">
                                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs ${i === 0 ? 'bg-amber-500 text-slate-950' :
                                                i === 1 ? 'bg-slate-400 text-slate-950' :
                                                    i === 2 ? 'bg-orange-700 text-white' :
                                                        'bg-gray-800 text-gray-500'
                                            }`}>
                                            {entry.rank}
                                        </span>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-[10px] font-bold text-white border border-gray-700">
                                                {entry.username.charAt(0).toUpperCase()}
                                            </div>
                                            <span className="text-white font-bold">{entry.username}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 text-primary font-black">
                                        {formatHashrate(entry.totalHashRate)}
                                    </td>
                                    <td className="px-8 py-6 hidden md:table-cell text-[10px] uppercase font-bold tracking-tighter">
                                        <div className="flex items-center gap-2">
                                            <Cpu className="w-3 h-3 text-slate-500" />
                                            {formatHashrate(entry.baseHashRate)}
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 hidden md:table-cell text-[10px] uppercase font-bold tracking-tighter">
                                        <div className="flex items-center gap-2">
                                            <Gamepad2 className="w-3 h-3 text-slate-500" />
                                            {formatHashrate(entry.gameHashRate)}
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 text-right">
                                        <button className="p-2 text-gray-600 hover:text-white transition-colors">
                                            <ChevronRight className="w-5 h-5" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
