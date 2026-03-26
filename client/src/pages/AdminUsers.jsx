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
    X,
    Coins
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
    const [creditPolAmount, setCreditPolAmount] = useState('');
    const [creditPolNote, setCreditPolNote] = useState('');
    const [creditPolTxHash, setCreditPolTxHash] = useState('');
    const [creditPolReplenish, setCreditPolReplenish] = useState(false);
    const [creditPolSubmitting, setCreditPolSubmitting] = useState(false);

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

    const handleCreditPol = async () => {
        if (!selectedUser?.user?.id) return;
        const amt = Number(String(creditPolAmount).replace(',', '.'));
        if (!Number.isFinite(amt) || amt <= 0) {
            toast.error('Indique um valor POL maior que zero.');
            return;
        }
        const uid = selectedUser.user.id;
        try {
            setCreditPolSubmitting(true);
            const body = {
                amountPol: amt,
                adminNote: creditPolNote.trim() || undefined,
                replenishIfDepositExistsForUser: creditPolReplenish
            };
            const th = creditPolTxHash.trim();
            if (th) body.txHash = th;
            const res = await api.post(`/admin/users/${uid}/credit-pol`, body);
            if (res.data?.ok) {
                toast.success(res.data.message || 'POL creditado na conta.');
                setCreditPolAmount('');
                setCreditPolNote('');
                setCreditPolTxHash('');
                setCreditPolReplenish(false);
                await loadUserDetails(uid);
                fetchUsers();
            }
        } catch (err) {
            const msg = err.response?.data?.message || err.message || 'Erro ao creditar POL.';
            toast.error(msg);
        } finally {
            setCreditPolSubmitting(false);
        }
    };

    const handleBanToggle = async (user) => {
        const banned = Boolean(user.isBanned ?? user.is_banned);
        const action = banned ? 'desbanir' : 'banir';
        if (!confirm(`Deseja realmente ${action} este usuário?`)) return;

        try {
            const res = await api.put(`/admin/users/${user.id}/ban`, { isBanned: !banned });
            if (res.data.ok) {
                toast.success(banned ? 'Usuário desbanido!' : 'Usuário banido!');
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
                    <p className="text-slate-500 text-sm font-medium">
                        Pesquisa por <span className="text-slate-400">ID</span> (ex.: 42 ou #42),{' '}
                        <span className="text-slate-400">nome</span>, <span className="text-slate-400">username</span>,{' '}
                        <span className="text-slate-400">e-mail</span>, <span className="text-slate-400">carteira</span> ou{' '}
                        <span className="text-slate-400">código de referência</span>.
                    </p>
                </div>
                <form onSubmit={handleSearch} className="relative group w-full md:w-96">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-amber-500 transition-colors" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="ID, nome, email, username, carteira, ref…"
                        className="w-full bg-slate-900 border border-slate-800 rounded-2xl py-3 pl-12 pr-4 text-sm text-slate-200 focus:outline-none focus:ring-4 focus:ring-amber-500/5 focus:border-amber-500/50 transition-all"
                    />
                </form>
            </div>

            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-500 shrink-0 self-start">
                    <Coins className="w-6 h-6" />
                </div>
                <div className="min-w-0 space-y-1">
                    <h3 className="text-sm font-black text-white uppercase tracking-widest">Creditar POL (saldo interno)</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                        1) Use a pesquisa acima para achar o jogador. 2) Clique em <strong className="text-slate-300">Ver perfil</strong> (olho){' '}
                        ou no atalho <strong className="text-slate-300">POL</strong> na linha. 3) No painel à direita, preencha{' '}
                        <strong className="text-amber-500/90">Crédito manual POL</strong> e confirme. Isto credita na conta (ledger), não envia on-chain.
                    </p>
                </div>
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
                                                title="Perfil, transações e crédito POL"
                                            >
                                                <Eye className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => loadUserDetails(u.id)}
                                                className="p-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-500 rounded-lg transition-all font-black text-[9px] uppercase tracking-tighter min-w-[2.25rem]"
                                                title="Abrir perfil para creditar POL"
                                                type="button"
                                            >
                                                POL
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

                            <div className="space-y-4 rounded-[2rem] border border-amber-500/20 bg-amber-500/[0.03] p-6">
                                <h4 className="text-xs font-black text-amber-500 uppercase tracking-widest flex items-center gap-2">
                                    <Coins className="w-4 h-4" /> Crédito manual POL (admin)
                                </h4>
                                <p className="text-[10px] text-slate-500 leading-relaxed">
                                    Credita saldo interno na conta (ledger). Não envia POL on-chain. Use hash on-chain só se for o depósito real já registado; marque &quot;repor saldo&quot; apenas nesse caso.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <label className="flex flex-col gap-1">
                                        <span className="text-[9px] font-black uppercase text-slate-500">Quantidade POL</span>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={creditPolAmount}
                                            onChange={(e) => setCreditPolAmount(e.target.value)}
                                            placeholder="ex: 10.5"
                                            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                                        />
                                    </label>
                                    <label className="flex flex-col gap-1 sm:col-span-2">
                                        <span className="text-[9px] font-black uppercase text-slate-500">Tx hash (opcional)</span>
                                        <input
                                            type="text"
                                            value={creditPolTxHash}
                                            onChange={(e) => setCreditPolTxHash(e.target.value)}
                                            placeholder="0x… (deixe vazio para referência interna)"
                                            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                                        />
                                    </label>
                                    <label className="flex flex-col gap-1 sm:col-span-2">
                                        <span className="text-[9px] font-black uppercase text-slate-500">Nota interna (opcional)</span>
                                        <textarea
                                            value={creditPolNote}
                                            onChange={(e) => setCreditPolNote(e.target.value)}
                                            rows={2}
                                            placeholder="Motivo do crédito…"
                                            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                                        />
                                    </label>
                                </div>
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={creditPolReplenish}
                                        onChange={(e) => setCreditPolReplenish(e.target.checked)}
                                        className="rounded border-slate-600 text-amber-500 focus:ring-amber-500/40"
                                    />
                                    <span className="text-[10px] text-slate-400">Repor saldo se já existir depósito com este tx hash (mesmo utilizador)</span>
                                </label>
                                <button
                                    type="button"
                                    disabled={creditPolSubmitting}
                                    onClick={handleCreditPol}
                                    className="w-full py-3 rounded-xl font-black text-xs uppercase tracking-widest bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-50 transition-all"
                                >
                                    {creditPolSubmitting ? 'A processar…' : 'Creditar POL'}
                                </button>
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
