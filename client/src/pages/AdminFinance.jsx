import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
    Wallet, CheckCircle2, XCircle, RefreshCw, ArrowUpCircle, ArrowDownCircle, Search
} from 'lucide-react';
import { api } from '../store/auth';

export default function AdminFinance() {
    const [withdrawals, setWithdrawals] = useState([]);
    const [overview, setOverview] = useState(null);
    const [activity, setActivity] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [tab, setTab] = useState('withdrawals'); // 'withdrawals', 'activity'
    const [completeModal, setCompleteModal] = useState({ open: false, id: null, txHash: '' });

    const fetchData = useCallback(async () => {
        try {
            setIsLoading(true);
            const [withdrawalsRes, overviewRes, activityRes] = await Promise.all([
                api.get('/admin/withdrawals/pending'),
                api.get('/admin/finance/overview'),
                api.get('/admin/finance/activity?limit=50')
            ]);

            if (withdrawalsRes.data.ok) setWithdrawals(withdrawalsRes.data.withdrawals || []);
            if (overviewRes.data.ok) setOverview(overviewRes.data.overview || {});
            if (activityRes.data.ok) setActivity(activityRes.data.activity || []);
        } catch (err) {
            console.error("Erro ao carregar dados financeiros", err);
            toast.error("Erro ao carregar dados financeiros");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleApprove = async (id) => {
        if (!confirm("Confirmar aprovação deste saque?")) return;
        try {
            const res = await api.post(`/admin/withdrawals/${id}/approve`);
            if (res.data.ok) {
                toast.success('Saque aprovado com sucesso!');
                fetchData();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao aprovar saque.');
        }
    };

    const handleReject = async (id) => {
        if (!confirm("Confirmar rejeição deste saque? Os fundos poderão ser devolvidos.")) return;
        try {
            const res = await api.post(`/admin/withdrawals/${id}/reject`);
            if (res.data.ok) {
                toast.success('Saque rejeitado.');
                fetchData();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao rejeitar saque.');
        }
    };

    const openCompleteModal = (id) => {
        setCompleteModal({ open: true, id, txHash: '' });
    };

    const submitComplete = async () => {
        const { id, txHash } = completeModal;
        if (!id) return;
        const trimmed = String(txHash || '').trim();
        if (!trimmed) {
            toast.error('Informe o hash da transação (0x + 64 caracteres hex).');
            return;
        }
        try {
            const res = await api.post(`/admin/withdrawals/${id}/complete`, { txHash: trimmed });
            if (res.data.ok) {
                toast.success('Saque marcado como concluído!');
                setCompleteModal({ open: false, id: null, txHash: '' });
                fetchData();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao concluir saque.');
        }
    };

    if (isLoading && !overview) return <div className="p-8 text-slate-400 font-bold uppercase tracking-widest animate-pulse text-center py-40">Carregando financeiro...</div>;

    return (
        <div className="space-y-8 animate-in fade-in duration-700 relative">
            {completeModal.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-lg w-full shadow-2xl">
                        <h3 className="text-lg font-black text-white mb-2">Concluir saque</h3>
                        <p className="text-xs text-slate-500 mb-4">Cole o hash da transação Polygon após o envio on-chain. O valor já foi reservado do saldo do usuário na solicitação.</p>
                        <input
                            type="text"
                            value={completeModal.txHash}
                            onChange={(e) => setCompleteModal((m) => ({ ...m, txHash: e.target.value }))}
                            placeholder="0x..."
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-xs font-mono text-slate-200 mb-4 outline-none focus:border-sky-500"
                        />
                        <div className="flex gap-2 justify-end">
                            <button
                                type="button"
                                onClick={() => setCompleteModal({ open: false, id: null, txHash: '' })}
                                className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={submitComplete}
                                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-black uppercase tracking-widest"
                            >
                                Confirmar concluído
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-black text-white flex items-center gap-3">
                        <Wallet className="w-6 h-6 text-emerald-500" /> Gestão Financeira
                    </h2>
                    <p className="text-slate-500 text-sm font-medium mt-1">Aprovação de saques e visão geral do sistema.</p>
                </div>
                <button
                    onClick={fetchData}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all border border-slate-700/50 w-fit"
                >
                    <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Sincronizar
                </button>
            </div>

            {/* Overview Stats */}
            {overview && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-[2rem] shadow-lg flex items-center gap-4">
                        <div className="p-4 rounded-2xl bg-amber-500/10 text-amber-500">
                            <Wallet className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Saques Pendentes/Aprovados</p>
                            <h3 className="text-xl font-black text-white">{withdrawals.length}</h3>
                        </div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-[2rem] shadow-lg flex items-center gap-4">
                        <div className="p-4 rounded-2xl bg-emerald-500/10 text-emerald-500">
                            <ArrowUpCircle className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Depositado (24h)</p>
                            <h3 className="text-xl font-black text-white">{Number(overview.deposits24h || 0).toFixed(2)} POL</h3>
                        </div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-[2rem] shadow-lg flex items-center gap-4">
                        <div className="p-4 rounded-2xl bg-red-500/10 text-red-500">
                            <ArrowDownCircle className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Sacado (24h)</p>
                            <h3 className="text-xl font-black text-white">{Number(overview.withdrawals24h || 0).toFixed(2)} POL</h3>
                        </div>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-4 border-b border-slate-800 pb-px">
                <button
                    onClick={() => setTab('withdrawals')}
                    className={`px-6 py-3 font-black text-xs uppercase tracking-widest transition-all ${tab === 'withdrawals' ? 'text-emerald-500 border-b-2 border-emerald-500' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    Saques à Processar
                </button>
                <button
                    onClick={() => setTab('activity')}
                    className={`px-6 py-3 font-black text-xs uppercase tracking-widest transition-all ${tab === 'activity' ? 'text-emerald-500 border-b-2 border-emerald-500' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    Atividade Recente
                </button>
            </div>

            {/* Content */}
            {tab === 'withdrawals' && (
                <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-400">
                            <thead className="bg-slate-800/30 text-[10px] uppercase font-bold tracking-widest text-slate-500">
                                <tr>
                                    <th className="px-8 py-4">Data</th>
                                    <th className="px-8 py-4">Usuário</th>
                                    <th className="px-8 py-4">Endereço (POLYGON)</th>
                                    <th className="px-8 py-4">Valor</th>
                                    <th className="px-8 py-4">Status</th>
                                    <th className="px-8 py-4">Tx hash</th>
                                    <th className="px-8 py-4 text-right">Ação</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800 font-medium">
                                {withdrawals.map((w) => (
                                    <tr key={w.id} className="hover:bg-slate-800/30 transition-colors group">
                                        <td className="px-8 py-5 text-xs whitespace-nowrap">
                                            {new Date(w.created_at || w.createdAt).toLocaleString()}
                                        </td>
                                        <td className="px-8 py-5">
                                            <span className="text-white font-bold text-xs">{w.user?.username || `User #${w.userId}`}</span>
                                        </td>
                                        <td className="px-8 py-5">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-mono text-slate-300 bg-slate-950 px-2 py-1 rounded border border-slate-800">{w.address}</span>
                                                <button onClick={() => { navigator.clipboard.writeText(w.address); toast.success('Endereço copiado!'); }} className="p-1 hover:text-white transition-colors">
                                                    <RefreshCw className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </td>
                                        <td className="px-8 py-5">
                                            <span className="text-amber-500 font-black">{Number(w.amount).toFixed(4)} POL</span>
                                        </td>
                                        <td className="px-8 py-5">
                                            {w.status === 'pending' ? (
                                                <span className="text-[9px] font-black uppercase px-2 py-1 bg-amber-500/10 text-amber-500 rounded">Pendente</span>
                                            ) : (
                                                <span className="text-[9px] font-black uppercase px-2 py-1 bg-emerald-500/10 text-emerald-500 rounded">Aprovado</span>
                                            )}
                                        </td>
                                        <td className="px-8 py-5 max-w-[200px]">
                                            {w.txHash || w.tx_hash ? (
                                                <span className="text-[9px] font-mono text-slate-400 break-all">{w.txHash || w.tx_hash}</span>
                                            ) : (
                                                <span className="text-[9px] text-slate-600">—</span>
                                            )}
                                        </td>
                                        <td className="px-8 py-5 text-right">
                                            <div className="flex flex-wrap gap-2 justify-end">
                                                {w.status === 'pending' ? (
                                                    <>
                                                        <button
                                                            onClick={() => handleApprove(w.id)}
                                                            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 rounded-lg transition-all text-[10px] font-bold uppercase tracking-widest"
                                                        >
                                                            <CheckCircle2 className="w-3 h-3" /> Aprovar
                                                        </button>
                                                        <button
                                                            onClick={() => handleReject(w.id)}
                                                            className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-all text-[10px] font-bold uppercase tracking-widest"
                                                        >
                                                            <XCircle className="w-3 h-3" /> Rejeitar
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => openCompleteModal(w.id)}
                                                            className="flex items-center gap-2 px-3 py-1.5 bg-sky-500 border border-sky-400/20 hover:bg-sky-400 text-white rounded-lg transition-all text-[10px] font-black uppercase tracking-widest shadow-lg shadow-sky-500/20"
                                                        >
                                                            <CheckCircle2 className="w-3 h-3" /> Concluído
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleReject(w.id)}
                                                            className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-all text-[10px] font-bold uppercase tracking-widest"
                                                        >
                                                            <XCircle className="w-3 h-3" /> Rejeitar
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {withdrawals.length === 0 && (
                                    <tr>
                                        <td colSpan="7" className="px-8 py-12 text-center text-slate-500 italic font-medium">
                                            Não há saques pendentes no momento. Tudo limpo!
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {tab === 'activity' && (
                <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-400">
                            <thead className="bg-slate-800/30 text-[10px] uppercase font-bold tracking-widest text-slate-500">
                                <tr>
                                    <th className="px-8 py-4">Data</th>
                                    <th className="px-8 py-4">Tipo</th>
                                    <th className="px-8 py-4">Usuário</th>
                                    <th className="px-8 py-4">Valor</th>
                                    <th className="px-8 py-4">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800 font-medium">
                                {activity.map((t) => (
                                    <tr key={t.id} className="hover:bg-slate-800/30 transition-colors">
                                        <td className="px-8 py-4 text-xs">
                                            {new Date(t.created_at || t.createdAt).toLocaleString()}
                                        </td>
                                        <td className="px-8 py-4 text-xs uppercase font-bold tracking-widest">
                                            {t.type === 'deposit' ? (
                                                <span className="text-emerald-500 flex items-center gap-1"><ArrowDownCircle className="w-3 h-3" /> Depósito</span>
                                            ) : (
                                                <span className="text-amber-500 flex items-center gap-1"><ArrowUpCircle className="w-3 h-3" /> Saque</span>
                                            )}
                                        </td>
                                        <td className="px-8 py-4 text-xs text-white">
                                            User #{t.user_id || t.userId}
                                        </td>
                                        <td className="px-8 py-4 font-mono text-slate-300">
                                            {Number(t.amount).toFixed(4)} POL
                                        </td>
                                        <td className="px-8 py-4 text-[10px] font-black uppercase tracking-widest">
                                            {t.status === 'completed' || t.status === 'approved' ? (
                                                <span className="text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded">Completo</span>
                                            ) : t.status === 'pending' ? (
                                                <span className="text-amber-500 bg-amber-500/10 px-2 py-1 rounded">Pendente</span>
                                            ) : (
                                                <span className="text-red-500 bg-red-500/10 px-2 py-1 rounded">{t.status}</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {activity.length === 0 && (
                                    <tr>
                                        <td colSpan="5" className="px-8 py-12 text-center text-slate-500 italic">
                                            Nenhuma transação encontrada.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
