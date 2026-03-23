import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
    Users,
    Search,
    RefreshCw,
    ChevronLeft,
    ChevronRight,
    Eye,
    Ban,
    ShieldCheck,
    Clock,
    Wallet,
    Activity,
    Cpu,
    X
} from 'lucide-react';
import { api } from '../store/auth';
import { formatHashrate } from '../utils/machine';

export default function AdminUsers() {
    const [users, setUsers] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState(null);
    const [isDetailsLoading, setIsDetailsLoading] = useState(false);

    const fetchUsers = useCallback(async () => {
        try {
            setIsLoading(true);
            const query = new URLSearchParams({
                page: String(page),
                pageSize: '20',
                q: search
            });
            const res = await api.get(`/admin/users?${query.toString()}`);
            if (res.data.ok) {
                setUsers(res.data.users);
                setTotal(res.data.total);
            }
        } catch (err) {
            console.error("Erro ao buscar usuários", err);
            toast.error("Erro ao buscar usuários");
        } finally {
            setIsLoading(false);
        }
    }, [page, search]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleSearch = (e) => {
        e.preventDefault();
        setPage(1);
        fetchUsers();
    };

    const loadUserDetails = async (userId) => {
        try {
            setIsDetailsLoading(true);
            const res = await api.get(`/admin/users/${userId}/details`);
            if (res.data.ok) {
                setSelectedUser(res.data);
            }
        } catch (err) {
            toast.error('Erro ao carregar detalhes do usuário.');
        } finally {
            setIsDetailsLoading(false);
        }
    };

    const handleBanToggle = async (user) => {
        const action = user.is_banned ? 'desbanir' : 'banir';
        if (!confirm(`Deseja realmente ${action} este usuário?`)) return;

        try {
            const res = await api.put(`/admin/users/${user.id}/ban`, { isBanned: !user.is_banned });
            if (res.data.ok) {
                toast.success(user.is_banned ? 'Usuário desbanido!' : 'Usuário banido!');
                fetchUsers();
                if (selectedUser?.user?.id === user.id) {
                    loadUserDetails(user.id);
                }
            }
        } catch (err) {
            toast.error('Erro ao processar banimento.');
        }
    };

    const pageCount = Math.ceil(total / 20);

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-black text-white">Gestão de Usuários</h2>
                    <p className="text-slate-500 text-sm font-medium">Controle de acesso e monitoramento de atividades.</p>
                </div>
                <form onSubmit={handleSearch} className="relative group w-full md:w-96">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-amber-500 transition-colors" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar por ID, E-mail ou Username..."
                        className="w-full bg-slate-900 border border-slate-800 rounded-2xl py-3 pl-12 pr-4 text-sm text-slate-200 focus:outline-none focus:ring-4 focus:ring-amber-500/5 focus:border-amber-500/50 transition-all"
                    />
                </form>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-400">
                        <thead className="bg-slate-800/30 text-[10px] uppercase font-bold tracking-widest text-slate-500">
                            <tr>
                                <th className="px-8 py-4">ID</th>
                                <th className="px-8 py-4">Usuário / E-mail</th>
                                <th className="px-8 py-4">IP</th>
                                <th className="px-8 py-4">Saldo</th>
                                <th className="px-8 py-4">Poder</th>
                                <th className="px-8 py-4">Status</th>
                                <th className="px-8 py-4 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 font-medium">
                            {isLoading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan="7" className="px-8 py-6 bg-slate-800/10" />
                                    </tr>
                                ))
                            ) : users.map((u) => (
                                <tr key={u.id} className="hover:bg-slate-800/30 transition-colors group">
                                    <td className="px-8 py-5 text-slate-500 font-mono text-xs">#{u.id}</td>
                                    <td className="px-8 py-5">
                                        <div className="flex flex-col">
                                            <span className="text-white font-bold text-xs">{u.username || u.name}</span>
                                            <span className="text-[10px] text-slate-500">{u.email}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5 text-[10px] font-mono text-slate-500">{u.ip || '--'}</td>
                                    <td className="px-8 py-5 text-amber-500 font-black text-xs">
                                        {Number(u.polBalance || 0).toFixed(6)}
                                    </td>
                                    <td className="px-8 py-5 text-slate-300 font-bold text-xs">
                                        {formatHashrate(Number(u.baseHashRate || 0))}
                                    </td>
                                    <td className="px-8 py-5">
                                        <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${u.isBanned ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'
                                            }`}>
                                            {u.isBanned ? 'Banido' : 'Ativo'}
                                        </span>
                                    </td>
                                    <td className="px-8 py-5 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => loadUserDetails(u.id)}
                                                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-all"
                                                title="Ver Detalhes"
                                            >
                                                <Eye className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleBanToggle(u)}
                                                className={`p-2 rounded-lg transition-all ${u.isBanned ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                                                    }`}
                                                title={u.isBanned ? 'Desbanir' : 'Banir'}
                                            >
                                                <Ban className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="px-8 py-4 bg-slate-800/20 border-t border-slate-800 flex items-center justify-between">
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">
                        Total: <span className="text-white">{total}</span> usuários
                    </p>
                    <div className="flex items-center gap-4">
                        <button
                            disabled={page === 1}
                            onClick={() => setPage(prev => prev - 1)}
                            className="p-2 bg-slate-800 text-slate-400 rounded-lg disabled:opacity-30 transition-all hover:bg-slate-700"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs font-black text-white uppercase tracking-widest">Página {page} de {pageCount}</span>
                        <button
                            disabled={page >= pageCount}
                            onClick={() => setPage(prev => prev + 1)}
                            className="p-2 bg-slate-800 text-slate-400 rounded-lg disabled:opacity-30 transition-all hover:bg-slate-700"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Details Sidebar/Modal */}
            {selectedUser && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-end bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="w-full max-w-2xl h-full bg-slate-900 border-l border-slate-800 shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-500">
                        <div className="sticky top-0 z-10 p-8 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-black text-white">Perfil do Usuário</h3>
                                <p className="text-[10px] text-amber-500 font-black uppercase tracking-[0.2em] mt-1">ID #{selectedUser.user.id}</p>
                            </div>
                            <button
                                onClick={() => setSelectedUser(null)}
                                className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-2xl transition-all"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="p-8 space-y-10 pb-20">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                <DetailCard label="Username" value={selectedUser.user.username || selectedUser.user.name} icon={Users} />
                                <DetailCard label="E-mail" value={selectedUser.user.email} icon={Search} small />
                                <DetailCard label="Carteira" value={selectedUser.user.walletAddress || 'Não vinculada'} icon={Wallet} small />
                                <DetailCard label="Saldo Pool" value={`${Number(selectedUser.user.polBalance).toFixed(6)} POL`} icon={Wallet} color="amber" />
                                <DetailCard label="Hash Base" value={formatHashrate(Number(selectedUser.user.baseHashRate || 0))} icon={Cpu} color="blue" />
                                <DetailCard label="Máquinas" value={selectedUser.metrics?.activeMachines} icon={Activity} color="emerald" />
                            </div>

                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] border-b border-slate-800 pb-2">Engajamento</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                    <StatMini label="Faucet" value={selectedUser.metrics?.faucetClaims} />
                                    <StatMini label="Shortlinks" value={selectedUser.metrics?.shortlinkDailyRuns} />
                                    <StatMini label="Auto GPU" value={selectedUser.metrics?.autoGpuClaims} />
                                    <StatMini label="YT Claims" value={selectedUser.metrics?.youtubeWatchClaims} />
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="bg-slate-950/50 rounded-[2rem] border border-slate-800 p-6 overflow-hidden">
                                    <h4 className="text-xs font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-amber-500" /> Transações Recentes
                                    </h4>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-[10px]">
                                            <thead className="text-slate-600 font-black uppercase tracking-tighter">
                                                <tr>
                                                    <th className="pb-3 px-2">Tipo</th>
                                                    <th className="pb-3 px-2">Valor</th>
                                                    <th className="pb-3 px-2 Status">Status</th>
                                                    <th className="pb-3 px-2 text-right">Data</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800">
                                                {selectedUser.recentTransactions?.map(tx => (
                                                    <tr key={tx.id}>
                                                        <td className="py-3 px-2 font-bold uppercase">{tx.type}</td>
                                                        <td className="py-3 px-2 text-amber-500 font-bold">{tx.amount.toFixed(4)}</td>
                                                        <td className="py-3 px-2">
                                                            <span className={`px-1.5 py-0.5 rounded ${tx.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                                                                {tx.status}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 px-2 text-right text-slate-500">{new Date(tx.createdAt).toLocaleDateString()}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => handleBanToggle(selectedUser.user)}
                                className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all ${selectedUser.user.isBanned
                                        ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500'
                                        : 'bg-red-500/10 hover:bg-red-500/20 text-red-500'
                                    }`}
                            >
                                {selectedUser.user.isBanned ? 'Revogar Banimento' : 'Banir permanentemente'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

function DetailCard({ label, value, icon: Icon, color = 'slate', small = false }) {
    const colors = {
        slate: 'text-slate-400 bg-slate-800/50',
        amber: 'text-amber-500 bg-amber-500/5',
        blue: 'text-blue-500 bg-blue-500/5',
        emerald: 'text-emerald-500 bg-emerald-500/5',
    };

    return (
        <div className={`p-4 rounded-2xl border border-slate-800 flex flex-col gap-2`}>
            <div className="flex items-center gap-2 opacity-50">
                <Icon className="w-3 h-3" />
                <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
            </div>
            <p className={`font-bold truncate ${small ? 'text-xs' : 'text-sm'} ${colors[color].split(' ')[0]}`}>{value || '--'}</p>
        </div>
    );
}

function StatMini({ label, value }) {
    return (
        <div className="bg-slate-950/30 p-3 rounded-xl border border-slate-800/50 text-center">
            <p className="text-[8px] font-black text-slate-600 uppercase tracking-tighter mb-1">{label}</p>
            <p className="text-xs font-black text-white">{value || 0}</p>
        </div>
    );
}
