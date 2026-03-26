import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
    Cpu,
    Plus,
    Save,
    Trash2,
    Pencil,
    X,
    Upload,
    Gift,
    Loader2,
    RefreshCw
} from 'lucide-react';
import { api } from '../store/auth';
import { formatHashrate } from '../utils/machine';

const GH = 1000000000;

function parseAdminNumber(value) {
    if (value === null || value === undefined) return NaN;
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    let s = String(value).trim().replace(/\s/g, '');
    if (!s) return NaN;
    if (s.includes(',') && !s.includes('.')) return Number(s.replace(',', '.'));
    if (s.includes(',') && s.includes('.')) return Number(s.replace(/\./g, '').replace(',', '.'));
    return Number(s);
}

/** API may return Prisma camelCase or legacy snake_case (values in H/s). */
function normalizeMiner(m) {
    if (!m) return m;
    const baseHs = Number(m.baseHashRate ?? m.base_hash_rate ?? 0);
    return {
        ...m,
        // Canonical H/s from API (do not divide again elsewhere — causes 1e-27 style bugs).
        baseHashRateHs: baseHs,
        // Admin edits this column in GH/s; backend stores H/s.
        baseHashRate: baseHs / GH,
        slotSize: m.slotSize ?? m.slot_size ?? 1,
        imageUrl: m.imageUrl ?? m.image_url ?? '',
        isActive: m.isActive ?? m.is_active ?? true,
        showInShop: m.showInShop ?? m.show_in_shop ?? true
    };
}

export default function AdminMiners() {
    const [miners, setMiners] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [editingMiner, setEditingMiner] = useState(null);
    const [newMiner, setNewMiner] = useState({
        name: '',
        slug: '',
        baseHashRate: '',
        price: '',
        slotSize: '1',
        imageUrl: '',
        isActive: true,
        showInShop: true
    });

    const fileInputRef = useRef(null);
    const editFileInputRef = useRef(null);

    const [grantMinerId, setGrantMinerId] = useState('');
    const [grantSkipBanned, setGrantSkipBanned] = useState(true);
    const [grantSkipIfHas, setGrantSkipIfHas] = useState(false);
    const [grantQuantity, setGrantQuantity] = useState(1);
    const [grantLoading, setGrantLoading] = useState(false);
    const [propagateMinerId, setPropagateMinerId] = useState(null);

    const fetchMiners = useCallback(async () => {
        try {
            setIsLoading(true);
            const res = await api.get('/admin/miners');
            if (res.data.ok) {
                setMiners((res.data.miners || []).map(normalizeMiner));
            }
        } catch (err) {
            console.error("Erro ao buscar mineradoras", err);
            toast.error("Erro ao buscar mineradoras");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMiners();
    }, [fetchMiners]);

    const handleCreateMiner = async (e) => {
        e.preventDefault();
        try {
            setIsSaving(true);
            const ghNew = parseAdminNumber(newMiner.baseHashRate);
            const priceNew = parseAdminNumber(newMiner.price);
            if (!Number.isFinite(ghNew) || ghNew < 0 || !Number.isFinite(priceNew)) {
                toast.error('Poder (GH/s) e preço devem ser números válidos (use ponto ou vírgula decimal).');
                return;
            }
            const payload = {
                ...newMiner,
                baseHashRate: ghNew * GH,
                price: priceNew,
                slotSize: Number(newMiner.slotSize)
            };
            const res = await api.post('/admin/miners', payload);
            if (res.data.ok) {
                toast.success('Mineradora criada com sucesso!');
                setShowCreateForm(false);
                setNewMiner({
                    name: '', slug: '', baseHashRate: '', price: '', slotSize: '1', imageUrl: '', isActive: true, showInShop: true
                });
                fetchMiners();
            }
        } catch (err) {
            toast.error('Erro ao criar mineradora.');
        } finally {
            setIsSaving(false);
        }
    };

    const buildUpdatePayload = (miner) => {
        const gh = parseAdminNumber(miner.baseHashRate);
        const baseHs =
            Number.isFinite(gh) && gh >= 0
                ? gh * GH
                : Number(miner.baseHashRateHs ?? 0);
        const priceNum = parseAdminNumber(miner.price);
        return {
            name: miner.name,
            slug: miner.slug,
            baseHashRate: baseHs,
            price: priceNum,
            slotSize: Number(miner.slotSize),
            imageUrl: miner.imageUrl || null,
            isActive: Boolean(miner.isActive),
            showInShop: Boolean(miner.showInShop)
        };
    };

    const handleUpdateMiner = async (miner) => {
        const payload = buildUpdatePayload(miner);
        if (!Number.isFinite(payload.price)) {
            toast.error('Preço inválido. Use número com ponto ou vírgula decimal (ex.: 0,75).');
            return false;
        }
        try {
            const res = await api.put(`/admin/miners/${miner.id}`, payload);
            if (res.data.ok) {
                const p = res.data.propagation;
                if (p) {
                    toast.success(
                        `Catálogo e instâncias atualizados: ${p.userMiners} no rack, ${p.userInventory} no inventário, ${p.shortlinkRewards} shortlink.`
                    );
                } else {
                    toast.success('Mineradora atualizada!');
                }
                fetchMiners();
                return true;
            }
        } catch (err) {
            const d = err.response?.data;
            const msg = d?.message || d?.error || err.message;
            console.error('Admin update miner', err.response?.status, d);
            toast.error(msg || 'Erro ao atualizar mineradora.');
        }
        return false;
    };

    /** Aplica o registo atual do catálogo `miners` a todas as instâncias (rack + inventário + shortlink). Não altera o catálogo. */
    const handlePropagateCatalogOnly = async (miner) => {
        const ok = window.confirm(
            `Empurrar o catálogo de "${miner.name}" (#${miner.id}) para TODAS as instâncias existentes?\n\n` +
                '• Rack (user_miners)\n' +
                '• Inventário (user_inventory)\n' +
                '• Recompensa shortlink ligada\n\n' +
                'Hash em cada linha = base do catálogo × nível da instância. O catálogo no servidor não muda (use se já editou no SQL ou quer forçar alinhamento).'
        );
        if (!ok) return;
        try {
            setPropagateMinerId(miner.id);
            const res = await api.post(`/admin/miners/${miner.id}/propagate-to-instances`);
            if (res.data?.ok) {
                const p = res.data.propagation;
                toast.success(
                    `Instâncias atualizadas: ${p.userMiners} rack · ${p.userInventory} inventário · ${p.shortlinkRewards} shortlink.`
                );
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Falha ao propagar.');
        } finally {
            setPropagateMinerId(null);
        }
    };

    const handleSaveEditModal = async (e) => {
        e.preventDefault();
        if (!editingMiner) return;
        try {
            setIsSaving(true);
            const ok = await handleUpdateMiner({
                ...editingMiner,
                slotSize: Number(editingMiner.slotSize)
            });
            if (ok) setEditingMiner(null);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteMiner = async (miner) => {
        const ok = window.confirm(
            `Excluir "${miner.name}" do catálogo?\n\nSó é permitido se nenhum jogador tiver esta máquina no rack ou inventário. Recompensas de faucet/shortlink vinculadas serão removidas.`
        );
        if (!ok) return;
        try {
            await api.delete(`/admin/miners/${miner.id}`);
            toast.success('Miner removido do catálogo.');
            fetchMiners();
        } catch (err) {
            const data = err.response?.data;
            toast.error(data?.message || 'Não foi possível excluir.');
        }
    };

    const handleFileUpload = async (e, isEdit) => {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = '';

        if (file.size > 4 * 1024 * 1024) {
            toast.error('Arquivo muito grande (máx. 4MB).');
            return;
        }

        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const dataUrl = reader.result;
                const base64 =
                    typeof dataUrl === 'string' && dataUrl.includes(',') ? dataUrl.split(',')[1] : null;
                if (!base64) {
                    toast.error('Não foi possível ler o arquivo.');
                    return;
                }
                const res = await api.post('/admin/miners/upload-image', {
                    fileBase64: base64,
                    fileName: file.name
                });
                if (res.data?.imageUrl) {
                    toast.success('Imagem carregada!');
                    if (isEdit) {
                        setEditingMiner((prev) => (prev ? { ...prev, imageUrl: res.data.imageUrl } : prev));
                    } else {
                        setNewMiner((prev) => ({ ...prev, imageUrl: res.data.imageUrl }));
                    }
                }
            } catch (err) {
                const d = err.response?.data;
                toast.error(d?.message || 'Erro no upload da imagem.');
            }
        };
        reader.onerror = () => toast.error('Erro ao ler o arquivo.');
        reader.readAsDataURL(file);
    };

    /** Row state is already normalized (GH/s in baseHashRate); never call normalizeMiner again. */
    const openEdit = (m) => {
        setEditingMiner({
            ...m,
            price: m.price
        });
    };

    const handleGrantToAllUsers = async () => {
        const id = Number(grantMinerId);
        if (!Number.isFinite(id) || id <= 0) {
            toast.error('Selecione uma mineradora no catálogo.');
            return;
        }
        const quantity = Number(grantQuantity);
        if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity < 1) {
            toast.error('Informe uma quantidade válida (mínimo 1).');
            return;
        }
        // Guard-rail para evitar operações acidentais gigantescas no inventário.
        if (quantity > 100) {
            toast.error('Quantidade muito alta. Limite: 100 por operação.');
            return;
        }
        const m = miners.find((x) => x.id === id);
        const label = m ? `"${m.name}"` : 'esta máquina';
        const ok = window.confirm(
            `Enviar ${quantity} unidade(s) de ${label} para o inventário de todos os usuários?\n\n` +
                (grantSkipBanned ? '• Contas banidas: ignoradas\n' : '• Inclui contas banidas\n') +
                (grantSkipIfHas ? '• Quem já tem esta máquina no inventário: ignorado\n' : '• Todos recebem mais uma unidade (pode duplicar)\n') +
                '\nA operação não desconta POL.'
        );
        if (!ok) return;
        try {
            setGrantLoading(true);
            const res = await api.post('/admin/miners/grant-to-all-users', {
                minerId: id,
                quantity,
                skipBanned: grantSkipBanned,
                skipIfHasMiner: grantSkipIfHas
            });
            if (res.data?.ok) {
                const { granted, eligibleUsers, skippedAlreadyHad } = res.data;
                toast.success(
                    `Enviado: ${granted} unidade(s). Elegíveis: ${eligibleUsers}.` +
                        (skippedAlreadyHad ? ` Ignorados (já tinham): ${skippedAlreadyHad}.` : '')
                );
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Falha ao distribuir máquinas.');
        } finally {
            setGrantLoading(false);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-black text-white">Catálogo de Mineradoras</h2>
                    <p className="text-slate-500 text-sm font-medium max-w-3xl">
                        Ao <strong className="text-slate-300">guardar</strong> uma máquina (ícone disco na linha ou &quot;Salvar e propagar&quot; no modal), o servidor{' '}
                        <strong className="text-amber-500/90">atualiza o catálogo e em seguida aplica o mesmo poder (base×nível), slots e imagem a todas as cópias</strong>{' '}
                        dessa máquina no rack e no inventário dos jogadores (e shortlink, se existir). O botão{' '}
                        <RefreshCw className="inline w-3.5 h-3.5 align-text-bottom opacity-70" /> só empurra de novo o que já está no catálogo, sem gravar alterações da tabela.
                    </p>
                </div>
                <button
                    onClick={() => setShowCreateForm(true)}
                    className="flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-amber-500/20"
                >
                    <Plus className="w-4 h-4" /> Nova Máquina
                </button>
            </div>

            <div className="bg-slate-900/80 border border-amber-500/20 rounded-2xl p-4 sm:p-6 space-y-4">
                <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 shrink-0">
                        <Gift className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 space-y-1">
                        <h3 className="text-sm font-black text-white uppercase tracking-widest">Distribuir para todos os jogadores</h3>
                        <p className="text-xs text-slate-500 leading-relaxed">
                            Coloca <span className="text-slate-400">{grantQuantity} unidade(s)</span> da mineradora escolhida no <strong className="text-slate-300">inventário</strong> de cada usuário (não instala no rack). Não cobra POL.
                        </p>
                    </div>
                </div>
                <div className="flex flex-col lg:flex-row lg:items-end gap-4">
                    <div className="flex-1 space-y-2 min-w-0">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Mineradora</label>
                        <select
                            value={grantMinerId}
                            onChange={(e) => setGrantMinerId(e.target.value)}
                            disabled={isLoading || miners.length === 0}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm text-white"
                        >
                            <option value="">— Selecionar —</option>
                            {miners.map((m) => (
                                <option key={m.id} value={m.id}>
                                    #{m.id} · {m.name} ({m.slug})
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
                        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer shrink-0">
                            <input
                                type="checkbox"
                                checked={grantSkipBanned}
                                onChange={(e) => setGrantSkipBanned(e.target.checked)}
                                className="rounded border-slate-600"
                            />
                            Ignorar banidos
                        </label>
                        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer shrink-0">
                            <input
                                type="checkbox"
                                checked={false}
                                onChange={() => {}}
                                disabled
                                className="rounded border-slate-600"
                            />
                            Só quem ainda não tem esta máquina no inventário (desativado: envia para todos)
                        </label>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                Quantidade
                            </label>
                            <input
                                type="number"
                                min={1}
                                step={1}
                                value={grantQuantity}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    if (v === '') return setGrantQuantity(1);
                                    const n = Number(v);
                                    if (!Number.isFinite(n)) return;
                                    setGrantQuantity(Math.max(1, Math.floor(n)));
                                }}
                                className="w-28 bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-sm text-white"
                            />
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleGrantToAllUsers}
                        disabled={grantLoading || !grantMinerId}
                        className="shrink-0 flex items-center justify-center gap-2 px-6 py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:pointer-events-none text-white rounded-xl font-black text-xs uppercase tracking-widest transition-colors"
                    >
                        {grantLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
                        Enviar a todos
                    </button>
                </div>
            </div>

            {/* Create Form Modal */}
            {showCreateForm && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="p-4 sm:p-8 border-b border-slate-800 flex items-center justify-between gap-3">
                            <h3 className="text-xl font-black text-white">Criar Nova Mineradora</h3>
                            <button onClick={() => setShowCreateForm(false)} className="p-2 text-slate-500 hover:text-white"><X className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleCreateMiner} className="p-4 sm:p-8 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nome</label>
                                <input required value={newMiner.name} onChange={e => setNewMiner(p => ({ ...p, name: e.target.value }))} className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm text-white" placeholder="Elite Miner v1" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Slug (URL)</label>
                                <input required value={newMiner.slug} onChange={e => setNewMiner(p => ({ ...p, slug: e.target.value }))} className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm text-white" placeholder="elite-miner-v1" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Poder (GH/s)</label>
                                <input required type="number" value={newMiner.baseHashRate} onChange={e => setNewMiner(p => ({ ...p, baseHashRate: e.target.value }))} className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm text-white" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Preço (POL)</label>
                                <input required type="number" value={newMiner.price} onChange={e => setNewMiner(p => ({ ...p, price: e.target.value }))} className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm text-white" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Tamanho (Slots)</label>
                                <select value={newMiner.slotSize} onChange={e => setNewMiner(p => ({ ...p, slotSize: e.target.value }))} className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm text-white">
                                    <option value="1">1 Slot</option>
                                    <option value="2">2 Slots</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">URL da Imagem</label>
                                <div className="flex gap-2">
                                    <input value={newMiner.imageUrl} onChange={e => setNewMiner(p => ({ ...p, imageUrl: e.target.value }))} className="flex-1 bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm text-white" />
                                    <button type="button" onClick={() => fileInputRef.current.click()} className="p-3 bg-slate-800 rounded-xl text-slate-400 hover:text-white"><Upload className="w-5 h-5" /></button>
                                    <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => handleFileUpload(e, false)} />
                                </div>
                            </div>
                            <div className="md:col-span-2 flex items-center gap-6 py-4">
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <input type="checkbox" checked={newMiner.isActive} onChange={e => setNewMiner(p => ({ ...p, isActive: e.target.checked }))} className="hidden" />
                                    <div className={`w-10 h-6 rounded-full p-1 transition-all ${newMiner.isActive ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                                        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${newMiner.isActive ? 'translate-x-4' : ''}`} />
                                    </div>
                                    <span className="text-xs font-bold text-slate-400 group-hover:text-white uppercase">Ativa</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <input type="checkbox" checked={newMiner.showInShop} onChange={e => setNewMiner(p => ({ ...p, showInShop: e.target.checked }))} className="hidden" />
                                    <div className={`w-10 h-6 rounded-full p-1 transition-all ${newMiner.showInShop ? 'bg-blue-500' : 'bg-slate-700'}`}>
                                        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${newMiner.showInShop ? 'translate-x-4' : ''}`} />
                                    </div>
                                    <span className="text-xs font-bold text-slate-400 group-hover:text-white uppercase">Na Loja</span>
                                </label>
                            </div>
                            <div className="md:col-span-2 pt-4">
                                <button type="submit" disabled={isSaving} className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-xl shadow-amber-500/10">
                                    {isSaving ? 'Processando...' : 'Confirmar Cadastro'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* Edit modal */}
            {editingMiner && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="p-4 sm:p-8 border-b border-slate-800 flex items-center justify-between gap-3">
                            <h3 className="text-xl font-black text-white">Editar mineradora</h3>
                            <button type="button" onClick={() => setEditingMiner(null)} className="p-2 text-slate-500 hover:text-white"><X className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleSaveEditModal} className="p-4 sm:p-8 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nome</label>
                                <input required value={editingMiner.name} onChange={e => setEditingMiner(p => ({ ...p, name: e.target.value }))} className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm text-white" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Slug</label>
                                <input required value={editingMiner.slug} onChange={e => setEditingMiner(p => ({ ...p, slug: e.target.value }))} className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm text-white" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Poder (GH/s)</label>
                                <input required type="number" value={editingMiner.baseHashRate} onChange={e => setEditingMiner(p => ({ ...p, baseHashRate: e.target.value }))} className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm text-white" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Preço (POL)</label>
                                <input required type="number" value={editingMiner.price} onChange={e => setEditingMiner(p => ({ ...p, price: e.target.value }))} className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm text-white" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Slots</label>
                                <select value={String(editingMiner.slotSize)} onChange={e => setEditingMiner(p => ({ ...p, slotSize: Number(e.target.value) }))} className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm text-white">
                                    <option value="1">1</option>
                                    <option value="2">2</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">URL da Imagem</label>
                                <div className="flex gap-2">
                                    <input value={editingMiner.imageUrl || ''} onChange={e => setEditingMiner(p => ({ ...p, imageUrl: e.target.value }))} className="flex-1 bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm text-white" />
                                    <button type="button" onClick={() => editFileInputRef.current.click()} className="p-3 bg-slate-800 rounded-xl text-slate-400 hover:text-white"><Upload className="w-5 h-5" /></button>
                                    <input type="file" ref={editFileInputRef} className="hidden" onChange={(e) => handleFileUpload(e, true)} />
                                </div>
                            </div>
                            <div className="md:col-span-2 flex items-center gap-6 py-4">
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <input type="checkbox" checked={editingMiner.isActive} onChange={e => setEditingMiner(p => ({ ...p, isActive: e.target.checked }))} className="hidden" />
                                    <div className={`w-10 h-6 rounded-full p-1 transition-all ${editingMiner.isActive ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                                        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${editingMiner.isActive ? 'translate-x-4' : ''}`} />
                                    </div>
                                    <span className="text-xs font-bold text-slate-400 group-hover:text-white uppercase">Ativa (catálogo)</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <input type="checkbox" checked={editingMiner.showInShop} onChange={e => setEditingMiner(p => ({ ...p, showInShop: e.target.checked }))} className="hidden" />
                                    <div className={`w-10 h-6 rounded-full p-1 transition-all ${editingMiner.showInShop ? 'bg-blue-500' : 'bg-slate-700'}`}>
                                        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${editingMiner.showInShop ? 'translate-x-4' : ''}`} />
                                    </div>
                                    <span className="text-xs font-bold text-slate-400 group-hover:text-white uppercase">Visível na loja</span>
                                </label>
                            </div>
                            <div className="md:col-span-2 pt-4 flex gap-3">
                                <button type="button" onClick={() => setEditingMiner(null)} className="flex-1 py-4 bg-slate-800 text-white rounded-2xl font-black text-sm uppercase">Cancelar</button>
                                <button type="submit" disabled={isSaving} className="flex-1 py-4 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-2xl font-black text-sm uppercase">
                                    {isSaving ? 'Salvando...' : 'Salvar e propagar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-400">
                        <thead className="bg-slate-800/30 text-[10px] uppercase font-bold tracking-widest text-slate-500">
                            <tr>
                                <th className="px-8 py-4 w-16">Preview</th>
                                <th className="px-8 py-4">Nome / Slug</th>
                                <th className="px-8 py-4">Poder (GH/s)</th>
                                <th className="px-8 py-4">Preço</th>
                                <th className="px-8 py-4">Slots</th>
                                <th className="px-8 py-4">Status</th>
                                <th className="px-8 py-4 text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 font-medium">
                            {isLoading ? (
                                <tr><td colSpan={7} className="px-8 py-12 text-center text-slate-500">Carregando…</td></tr>
                            ) : miners.map((m) => (
                                <tr key={m.id} className="hover:bg-slate-800/30 transition-colors group">
                                    <td className="px-8 py-5">
                                        <div className="w-12 h-12 bg-slate-950 rounded-lg p-2 border border-slate-800">
                                            {m.imageUrl ? (
                                                <img src={m.imageUrl} alt="" className="w-full h-full object-contain" />
                                            ) : (
                                                <Cpu className="w-full h-full text-slate-600 p-1" />
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-8 py-5">
                                        <div className="flex flex-col">
                                            <input
                                                value={m.name}
                                                onChange={e => setMiners(prev => prev.map(item => item.id === m.id ? { ...item, name: e.target.value } : item))}
                                                className="bg-transparent border-none text-white font-bold text-xs p-0 focus:ring-0 w-full"
                                            />
                                            <span className="text-[10px] text-slate-500">{m.slug}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5">
                                        <div className="flex flex-col gap-0.5">
                                            <input
                                                type="number"
                                                step="any"
                                                value={m.baseHashRate}
                                                onChange={e => setMiners(prev => prev.map(item => item.id === m.id ? { ...item, baseHashRate: e.target.value } : item))}
                                                className="bg-transparent border-none text-amber-500 font-black text-xs p-0 focus:ring-0 w-24"
                                                title="Valor em GH/s (armazenado no banco como H/s)"
                                            />
                                            <span className="text-[9px] text-slate-600 font-medium tabular-nums">
                                                ≈ {formatHashrate(Number(m.baseHashRate || 0) * GH)}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5">
                                        <input
                                            type="number"
                                            value={m.price}
                                            onChange={e => setMiners(prev => prev.map(item => item.id === m.id ? { ...item, price: e.target.value } : item))}
                                            className="bg-transparent border-none text-amber-500 font-black text-xs p-0 focus:ring-0 w-20"
                                        />
                                    </td>
                                    <td className="px-8 py-5">
                                        <select
                                            value={String(m.slotSize)}
                                            onChange={e => setMiners(prev => prev.map(item => item.id === m.id ? { ...item, slotSize: Number(e.target.value) } : item))}
                                            className="bg-transparent border-none text-slate-500 text-xs p-0 focus:ring-0"
                                        >
                                            <option value="1">1</option>
                                            <option value="2">2</option>
                                        </select>
                                    </td>
                                    <td className="px-8 py-5">
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setMiners(prev => prev.map(item => item.id === m.id ? { ...item, isActive: !item.isActive } : item))}
                                                className={`px-2 py-1 rounded text-[9px] font-black uppercase ${m.isActive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-800 text-slate-500'}`}
                                                title="Ativa no catálogo (não remove instâncias dos jogadores)"
                                            >
                                                {m.isActive ? 'Ativa' : 'Off'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setMiners(prev => prev.map(item => item.id === m.id ? { ...item, showInShop: !item.showInShop } : item))}
                                                className={`px-2 py-1 rounded text-[9px] font-black uppercase ${m.showInShop ? 'bg-blue-500/10 text-blue-500' : 'bg-slate-800 text-slate-500'}`}
                                                title="Exibir ou ocultar na loja"
                                            >
                                                {m.showInShop ? 'Shop' : 'Hidden'}
                                            </button>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5 text-right">
                                        <div className="flex justify-end gap-1">
                                            <button
                                                type="button"
                                                onClick={() => openEdit(m)}
                                                className="p-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-lg transition-all"
                                                title="Editar (slug, imagem, tudo)"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteMiner(m)}
                                                className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-all"
                                                title="Excluir do catálogo"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handlePropagateCatalogOnly(m)}
                                                disabled={propagateMinerId === m.id}
                                                className="p-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 rounded-lg transition-all disabled:opacity-40"
                                                title="Aplicar só o catálogo atual a todas as instâncias (rack + inventário)"
                                            >
                                                {propagateMinerId === m.id ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <RefreshCw className="w-4 h-4" />
                                                )}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleUpdateMiner(m)}
                                                className="p-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 rounded-lg transition-all"
                                                title="Gravar alterações da linha no catálogo e propagar a todas as instâncias"
                                            >
                                                <Save className="w-4 h-4" />
                                            </button>
                                        </div>
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
