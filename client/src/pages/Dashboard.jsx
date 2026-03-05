import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pickaxe, Zap, Activity, Coins, Clock, TrendingUp, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '../store/auth';
import { useGameStore } from '../store/game';

export default function Dashboard() {
    const { t } = useTranslation();
    const { user } = useAuthStore();
    const { stats, initSocket } = useGameStore();

    useEffect(() => {
        initSocket();
    }, [initSocket]);

    const miner = stats?.miner;
    const blockHistory = stats?.blockHistory || [];

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight mb-2">
                        {t('dashboard.welcome', { name: user?.name })}
                    </h1>
                    <p className="text-gray-500 font-medium max-w-lg">
                        {t('dashboard.subtitle')}
                    </p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Sincronizado</span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card 
                    icon={Coins} 
                    label={t('dashboard.balance')} 
                    value={miner ? miner.balance.toFixed(6) : '0.000000'} 
                    unit={stats?.tokenSymbol || 'POL'}
                    color="blue"
                />
                <Card 
                    icon={Pickaxe} 
                    label={t('dashboard.speed')} 
                    value={miner ? miner.estimatedHashRate.toFixed(2) : '0.00'} 
                    unit="GH/s"
                    color="purple"
                />
                <Card 
                    icon={Zap} 
                    label={t('dashboard.network_power')} 
                    value={stats?.networkHashRate ? stats.networkHashRate.toFixed(2) : '0.00'} 
                    unit="GH/s"
                    color="amber"
                />
                <Card 
                    icon={Clock} 
                    label={t('dashboard.next_block')} 
                    value={stats?.blockCountdownSeconds || 0} 
                    unit="segs"
                    color="emerald"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-surface border border-gray-800/50 rounded-3xl overflow-hidden shadow-xl">
                    <div className="px-8 py-6 border-b border-gray-800/50 flex justify-between items-center bg-gray-800/20">
                        <h2 className="text-lg font-bold text-white flex items-center gap-3">
                            <Activity className="w-5 h-5 text-primary" /> {t('dashboard.history_title')}
                        </h2>
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{t('dashboard.last_blocks')}</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-gray-400">
                            <thead className="bg-gray-800/30 text-[10px] uppercase font-bold tracking-widest text-gray-500">
                                <tr>
                                    <th className="px-8 py-4">{t('dashboard.block_id')}</th>
                                    <th className="px-8 py-4">{t('dashboard.distributed')}</th>
                                    <th className="px-8 py-4">{t('sidebar.machines')}</th>
                                    <th className="px-8 py-4 text-right">{t('dashboard.time')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800/50 font-medium">
                                {blockHistory.slice(0, 5).map((block) => (
                                    <tr key={block.blockNumber} className="hover:bg-primary/5 transition-colors group">
                                        <td className="px-8 py-5">
                                            <span className="bg-gray-800/50 px-3 py-1 rounded-lg text-xs font-bold text-white group-hover:text-primary transition-colors">
                                                #{block.blockNumber}
                                            </span>
                                        </td>
                                        <td className="px-8 py-5">
                                            <div className="flex items-center gap-2">
                                                <TrendingUp className="w-4 h-4 text-emerald-400" />
                                                <span className="text-emerald-400 font-black">+{block.reward.toFixed(4)} <span className="text-[10px] font-normal">{stats?.tokenSymbol}</span></span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-5 text-gray-300">{block.minerCount} {t('dashboard.active_miners')}</td>
                                        <td className="px-8 py-5 text-right text-gray-500 font-mono text-xs">
                                            {new Date(block.timestamp).toLocaleTimeString()}
                                        </td>
                                    </tr>
                                ))}
                                {blockHistory.length === 0 && (
                                    <tr>
                                        <td colSpan="4" className="px-8 py-12 text-center text-gray-500 font-medium italic">
                                            {t('dashboard.no_blocks')}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="bg-gradient-to-br from-primary to-blue-600 rounded-3xl p-8 text-white shadow-2xl shadow-primary/20 relative overflow-hidden group">
                        <div className="relative z-10">
                            <h3 className="text-xl font-black mb-2 tracking-tight">{t('dashboard.account_status')}</h3>
                            <p className="text-blue-100/70 text-sm font-medium leading-relaxed mb-6">
                                {t('dashboard.efficiency_msg')}
                            </p>
                            <button className="px-6 py-3 bg-white text-primary rounded-xl font-bold text-sm hover:bg-blue-50 transition-colors shadow-lg">
                                {t('common.next')}
                            </button>
                        </div>
                        <Pickaxe className="absolute right-[-20px] bottom-[-20px] w-48 h-48 text-white/10 -rotate-12 group-hover:scale-110 transition-transform duration-700" />
                    </div>

                    <div className="bg-surface border border-gray-800/50 rounded-3xl p-6 shadow-xl">
                        <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-widest text-gray-400">{t('dashboard.real_time_earnings')}</h3>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-gray-500">HashRate Estimado</span>
                                <span className="text-sm font-bold text-white">{miner?.estimatedHashRate.toFixed(2) || '0.00'} GH/s</span>
                            </div>
                            <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                <div className="h-full bg-primary animate-pulse" style={{ width: '65%' }}></div>
                            </div>
                            <p className="text-[10px] text-gray-500 font-medium">
                                Baseado na média de participação dos últimos 10 blocos.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Card({ icon: Icon, label, value, unit, color }) {
    const colorMap = {
        blue: 'bg-blue-500/10 text-blue-400',
        purple: 'bg-purple-500/10 text-purple-400',
        amber: 'bg-amber-500/10 text-amber-400',
        emerald: 'bg-emerald-500/10 text-emerald-400',
    };

    return (
        <div className="bg-surface border border-gray-800/50 hover:border-gray-700/50 rounded-3xl p-6 shadow-lg transition-all group overflow-hidden relative">
            <div className="flex items-center gap-4 relative z-10">
                <div className={`p-3.5 rounded-2xl ${colorMap[color]} group-hover:scale-110 transition-transform duration-300`}>
                    <Icon className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">{label}</p>
                    <h3 className="text-2xl font-black text-white truncate tracking-tighter">
                        {value} <span className="text-xs font-bold text-gray-500 tracking-normal ml-0.5 uppercase">{unit}</span>
                    </h3>
                </div>
            </div>
            <div className="absolute right-0 bottom-0 w-16 h-16 bg-gradient-to-br from-transparent to-gray-800/10 rounded-tl-3xl"></div>
        </div>
    );
}
