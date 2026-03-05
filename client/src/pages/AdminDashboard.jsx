import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { 
    Users, 
    Cpu, 
    Wallet, 
    Activity, 
    Clock, 
    ShieldAlert, 
    ArrowUpCircle, 
    ArrowDownCircle, 
    Search,
    RefreshCw,
    CheckCircle2,
    XCircle,
    Copy,
    ExternalLink,
    Ban,
    ChevronRight,
    Server,
    HardDrive,
    MemoryStick
} from 'lucide-react';
import { api } from '../store/auth';

export default function AdminDashboard() {
    const [stats, setStats] = useState(null);
    const [users, setUsers] = useState([]);
    const [withdrawals, setWithdrawals] = useState([]);
    const [auditLogs, setAuditLogs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchData = useCallback(async () => {
        try {
            setIsLoading(true);
            const [statsRes, usersRes, withdrawalsRes, auditRes] = await Promise.all([
                api.get('/admin/stats'),
                api.get('/admin/users?limit=10'),
                api.get('/admin/withdrawals/pending'),
                api.get('/admin/audit?limit=10')
            ]);

            if (statsRes.data.ok) setStats(statsRes.data.stats);
            if (usersRes.data.ok) setUsers(usersRes.data.users);
            if (withdrawalsRes.data.ok) setWithdrawals(withdrawalsRes.data.withdrawals);
            if (auditRes.data.ok) setAuditLogs(auditRes.data.logs);
        } catch (err) {
            console.error("Erro ao carregar dados administrativos", err);
            toast.error("Erro ao carregar dados administrativos");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleBanUser = async (userId, isBanned) => {
        try {
            const res = await api.put(`/admin/users/${userId}/ban`, { isBanned: !isBanned });
            if (res.data.ok) {
                toast.success(isBanned ? 'Usuário desbanido!' : 'Usuário banido!');
                fetchData();
            }
        } catch (err) {
            toast.error('Erro ao atualizar status do usuário.');
        }
    };

    const handleApproveWithdrawal = async (id) => {
        try {
            const res = await api.post(`/admin/withdrawals/${id}/approve`);
            if (res.data.ok) {
                toast.success('Saque aprovado!');
                fetchData();
            }
        } catch (err) {
            toast.error('Erro ao aprovar saque.');
        }
    };

    if (isLoading && !stats) return <div className="p-8 text-slate-400 font-bold uppercase tracking-widest animate-pulse text-center py-40">Carregando painel administrativo...</div>;

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-black text-white">Resumo Geral</h2>
                    <p className="text-slate-500 text-sm font-medium">Visão em tempo real da saúde da plataforma.</p>
                </div>
                <button 
                    onClick={fetchData}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all border border-slate-700/50"
                >
                    <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Sincronizar Dados
                </button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <AdminStatCard label="Usuários Totais" value={stats?.usersTotal} icon={Users} color="blue" />
                <AdminStatCard label="Novos (24h)" value={stats?.usersNew24h} icon={Users} color="emerald" />
                <AdminStatCard label="Mineradoras Ativas" value={stats?.minersActive} icon={Cpu} color="amber" />
                <AdminStatCard label="Saldo em Custódia" value={stats?.balanceTotal?.toFixed(4)} unit="POL" icon={Wallet} color="purple" />
            </div>

            {/* Server Health Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <HealthCard 
                    label="CPU" 
                    value={`${stats?.serverCpuUsagePercent?.toFixed(1)}%`} 
                    sub={`${stats?.serverCpuCores} cores`}
                    icon={Server} 
                    progress={stats?.serverCpuUsagePercent}
                />
                <HealthCard 
                    label="Memória RAM" 
                    value={`${(stats?.serverMemoryUsedBytes / 1024**3).toFixed(1)}GB`} 
                    sub={`de ${(stats?.serverMemoryTotalBytes / 1024**3).toFixed(1)}GB`}
                    icon={MemoryStick} 
                    progress={stats?.serverMemoryUsagePercent}
                />
                <HealthCard 
                    label="Armazenamento" 
                    value={`${(stats?.serverDiskUsedBytes / 1024**3).toFixed(1)}GB`} 
                    sub={`de ${(stats?.serverDiskTotalBytes / 1024**3).toFixed(1)}GB`}
                    icon={HardDrive} 
                    progress={stats?.serverDiskUsagePercent}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Pending Withdrawals */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                    <div className="px-8 py-6 border-b border-slate-800 flex justify-between items-center bg-slate-800/20">
                        <h2 className="text-lg font-bold text-white flex items-center gap-3">
                            <Wallet className="w-5 h-5 text-amber-500" /> Saques Pendentes
                        </h2>
                        <span className="bg-amber-500/10 text-amber-500 text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-widest">
                            {withdrawals.length} Aguardando
                        </span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-400">
                            <thead className="bg-slate-800/30 text-[10px] uppercase font-bold tracking-widest text-slate-500">
                                <tr>
                                    <th className="px-8 py-4">Usuário</th>
                                    <th className="px-8 py-4">Valor</th>
                                    <th className="px-8 py-4">Ação</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800 font-medium">
                                {withdrawals.map((w) => (
                                    <tr key={w.id} className="hover:bg-slate-800/30 transition-colors group">
                                        <td className="px-8 py-5">
                                            <div className="flex flex-col">
                                                <span className="text-white font-bold text-xs">ID #{w.user_id}</span>
                                                <span className="text-[10px] font-mono text-slate-500 truncate w-32">{w.address}</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-5">
                                            <span className="text-amber-500 font-black">{w.amount.toFixed(4)} <span className="text-[10px] font-normal opacity-60">POL</span></span>
                                        </td>
                                        <td className="px-8 py-5">
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => handleApproveWithdrawal(w.id)}
                                                    className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 rounded-lg transition-all"
                                                >
                                                    <CheckCircle2 className="w-4 h-4" />
                                                </button>
                                                <button className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-all">
                                                    <XCircle className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {withdrawals.length === 0 && (
                                    <tr>
                                        <td colSpan="3" className="px-8 py-12 text-center text-slate-500 italic">
                                            Nenhum saque pendente no momento.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Recent Users */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                    <div className="px-8 py-6 border-b border-slate-800 flex justify-between items-center bg-slate-800/20">
                        <h2 className="text-lg font-bold text-white flex items-center gap-3">
                            <Users className="w-5 h-5 text-blue-500" /> Usuários Recentes
                        </h2>
                        <button className="text-slate-500 hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-1">
                            Ver Todos <ChevronRight className="w-3 h-3" />
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-400">
                            <thead className="bg-slate-800/30 text-[10px] uppercase font-bold tracking-widest text-slate-500">
                                <tr>
                                    <th className="px-8 py-4">Usuário</th>
                                    <th className="px-8 py-4">Status</th>
                                    <th className="px-8 py-4">Ação</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800 font-medium">
                                {users.map((u) => (
                                    <tr key={u.id} className="hover:bg-slate-800/30 transition-colors group">
                                        <td className="px-8 py-5">
                                            <div className="flex flex-col">
                                                <span className="text-white font-bold text-xs">{u.username || u.name}</span>
                                                <span className="text-[10px] text-slate-500">{u.email}</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-5">
                                            <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                                                u.is_banned ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'
                                            }`}>
                                                {u.is_banned ? 'Banido' : 'Ativo'}
                                            </span>
                                        </td>
                                        <td className="px-8 py-5">
                                            <button 
                                                onClick={() => handleBanUser(u.id, u.is_banned)}
                                                className={`p-2 rounded-lg transition-all ${
                                                    u.is_banned ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                                                }`}
                                            >
                                                <Ban className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Audit Logs */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                <div className="px-8 py-6 border-b border-slate-800 flex justify-between items-center bg-slate-800/20">
                    <h2 className="text-lg font-bold text-white flex items-center gap-3">
                        <Activity className="w-5 h-5 text-purple-500" /> Logs de Auditoria
                    </h2>
                    <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Últimos Eventos</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-400">
                        <thead className="bg-slate-800/30 text-[10px] uppercase font-bold tracking-widest text-slate-500">
                            <tr>
                                <th className="px-8 py-4">Evento</th>
                                <th className="px-8 py-4">Usuário</th>
                                <th className="px-8 py-4">IP</th>
                                <th className="px-8 py-4 text-right">Data/Hora</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 font-medium">
                            {auditLogs.map((log, i) => (
                                <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                                    <td className="px-8 py-4 text-xs font-bold text-slate-300">{log.action}</td>
                                    <td className="px-8 py-4 text-xs text-slate-500">{log.user_email || `User #${log.user_id}`}</td>
                                    <td className="px-8 py-4 text-[10px] font-mono text-slate-600">{log.ip}</td>
                                    <td className="px-8 py-4 text-right text-[10px] font-medium text-slate-500">
                                        {new Date(log.created_at).toLocaleString()}
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

function AdminStatCard({ label, value, unit, icon: Icon, color }) {
    const colorMap = {
        blue: 'bg-blue-500/10 text-blue-500',
        emerald: 'bg-emerald-500/10 text-emerald-500',
        amber: 'bg-amber-500/10 text-amber-500',
        purple: 'bg-purple-500/10 text-purple-500',
    };

    return (
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-[2rem] shadow-lg flex items-center gap-4 transition-all hover:border-slate-700">
            <div className={`p-4 rounded-2xl ${colorMap[color]}`}>
                <Icon className="w-6 h-6" />
            </div>
            <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{label}</p>
                <h3 className="text-xl font-black text-white">
                    {value || 0} {unit && <span className="text-xs font-bold text-slate-600 ml-1">{unit}</span>}
                </h3>
            </div>
        </div>
    );
}

function HealthCard({ label, value, sub, progress, icon: Icon }) {
    return (
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-lg space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-800 rounded-lg">
                        <Icon className="w-4 h-4 text-slate-400" />
                    </div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</span>
                </div>
                <span className="text-sm font-black text-white">{value}</span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div 
                    className={`h-full transition-all duration-1000 ${progress > 80 ? 'bg-red-500' : progress > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                    style={{ width: `${progress}%` }}
                ></div>
            </div>
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-tighter">{sub}</p>
        </div>
    );
}
