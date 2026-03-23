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
    Upload
} from 'lucide-react';
import { api } from '../store/auth';
const GH = 1000000000;

/** API may return Prisma camelCase or legacy snake_case */
function normalizeMiner(m) {
    if (!m) return m;
    const baseHs = Number(m.baseHashRate ?? m.base_hash_rate ?? 0);
    return {
        ...m,
        // Admin keeps editing in GH/s for convenience; backend stores H/s.
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
            const payload = {
                ...newMiner,
                baseHashRate: Number(newMiner.baseHashRate) * GH,
                price: Number(newMiner.price),
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

    const buildUpdatePayload = (miner) => ({
        name: miner.name,
        slug: miner.slug,
        baseHashRate: Number(miner.baseHashRate) * GH,
        price: Number(miner.price),
        slotSize: Number(miner.slotSize),
        imageUrl: miner.imageUrl || null,
        isActive: Boolean(miner.isActive),
        showInShop: Boolean(miner.showInShop)
    });

    const handleUpdateMiner = async (miner) => {
        try {
            const res = await api.put(`/admin/miners/${miner.id}`, buildUpdatePayload(miner));
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
            const msg = err.response?.data?.message;
            toast.error(msg || 'Erro ao atualizar mineradora.');
        }
        return false;
    };

    const handleSaveEditModal = async (e) => {
        e.preventDefault();
        if (!editingMiner) return;
        try {
            setIsSaving(true);
            const ok = await handleUpdateMiner({
                ...editingMiner,
                baseHashRate: Number(editingMiner.baseHashRate),
                price: Number(editingMiner.price),
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

        try {
            const res = await api.post('/admin/miners/upload-image', file, {
                headers: { 'X-File-Name': file.name }
            });
            if (res.data.imageUrl) {
                toast.success('Imagem carregada!');
                if (isEdit) {
                    setEditingMiner((prev) => (prev ? { ...prev, imageUrl: res.data.imageUrl } : prev));
                } else {
                    setNewMiner((prev) => ({ ...prev, imageUrl: res.data.imageUrl }));
                }
            }
        } catch (err) {
            toast.error('Erro no upload da imagem.');
        }
    };

    const openEdit = (m) => {
        setEditingMiner({
            ...normalizeMiner(m),
            baseHashRate: normalizeMiner(m).baseHashRate,
            slotSize: normalizeMiner(m).slotSize,
            price: m.price
        });
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-black text-white">Catálogo de Mineradoras</h2>
                    <p className="text-slate-500 text-sm font-medium">
                        Alterações no catálogo são propagadas para todas as instâncias (rack, inventário e recompensa shortlink vinculada).
                    </p>
                </div>
                <button
                    onClick={() => setShowCreateForm(true)}
                    className="flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-amber-500/20"
                >
                    <Plus className="w-4 h-4" /> Nova Máquina
                </button>
            </div>

            {/* Create Form Modal */}
            {showCreateForm && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="p-8 border-b border-slate-800 flex items-center justify-between">
                            <h3 className="text-xl font-black text-white">Criar Nova Mineradora</h3>
                            <button onClick={() => setShowCreateForm(false)} className="p-2 text-slate-500 hover:text-white"><X className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleCreateMiner} className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
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
                        <div className="p-8 border-b border-slate-800 flex items-center justify-between">
                            <h3 className="text-xl font-black text-white">Editar mineradora</h3>
                            <button type="button" onClick={() => setEditingMiner(null)} className="p-2 text-slate-500 hover:text-white"><X className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleSaveEditModal} className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
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
                                <th className="px-8 py-4">Poder</th>
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
                                        <input
                                            type="number"
                                            value={m.baseHashRate}
                                            onChange={e => setMiners(prev => prev.map(item => item.id === m.id ? { ...item, baseHashRate: e.target.value } : item))}
                                            className="bg-transparent border-none text-slate-300 font-bold text-xs p-0 focus:ring-0 w-16"
                                        />
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
                                                onClick={() => handleUpdateMiner(m)}
                                                className="p-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 rounded-lg transition-all"
                                                title="Salvar linha e propagar"
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
