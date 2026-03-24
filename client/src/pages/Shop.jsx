import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { ShoppingCart, Zap, TrendingUp, Info, X, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { api } from '../store/auth';
import { useGameStore } from '../store/game';
import { formatHashrate } from '../utils/machine';

export default function Shop() {
    const { t } = useTranslation();
    const [miners, setMiners] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isPurchasing, setIsPurchasing] = useState(false);
    const [selectedMiner, setSelectedMiner] = useState(null);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [purchasesEnabled, setPurchasesEnabled] = useState(false);
    const [shopDisabled, setShopDisabled] = useState(false);
    const { fetchAll, setMinerPolBalance } = useGameStore();

    useEffect(() => {
        const fetchMiners = async () => {
            try {
                const res = await api.get('/shop/miners');
                if (res.data.ok) {
                    setMiners(res.data.miners);
                    setPurchasesEnabled(Boolean(res.data.purchasesEnabled));
                    setShopDisabled(!res.data.purchasesEnabled);
                }
            } catch (err) {
                if (err.response?.data?.code === 'SHOP_DISABLED' || err.response?.status === 503) {
                    setShopDisabled(true);
                    setPurchasesEnabled(false);
                    setMiners([]);
                } else {
                    console.error("Erro ao buscar mineradoras", err);
                }
            } finally {
                setIsLoading(false);
            }
        };

        fetchMiners();
    }, []);

    const openConfirmModal = (miner) => {
        if (!purchasesEnabled) {
            toast.error('Compras estão temporariamente desativadas.');
            return;
        }
        setSelectedMiner(miner);
        setShowConfirmModal(true);
    };

    const handlePurchase = async () => {
        if (isPurchasing || !selectedMiner) return;

        try {
            setIsPurchasing(true);
            const res = await api.post('/shop/purchase', { minerId: selectedMiner.id });
            if (res.data.ok) {
                toast.success(res.data.message || t('shop.success_purchase'));
                const nb = Number(res.data.newBalance);
                if (Number.isFinite(nb)) {
                    setMinerPolBalance(nb);
                }
                fetchAll(); // Refresh machines / inventory / racks
                setShowConfirmModal(false);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || t('common.error'));
        } finally {
            setIsPurchasing(false);
        }
    };

    if (isLoading) return (
        <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Carregando Inventário...</p>
        </div>
    );

    if (shopDisabled) {
        return (
            <div className="space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-white tracking-tight">{t('shop.title')}</h1>
                        <p className="text-gray-500 font-medium">{t('shop.subtitle')}</p>
                    </div>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 text-amber-300 text-sm font-semibold">
                    A loja esta temporariamente desativada. Novas compras estao indisponiveis no momento.
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight">{t('shop.title')}</h1>
                    <p className="text-gray-500 font-medium">{t('shop.subtitle')}</p>
                </div>
                <div className="flex items-center gap-3 px-4 py-2 bg-primary/10 border border-primary/20 rounded-xl">
                    <ShoppingCart className="w-4 h-4 text-primary" />
                    <span className="text-[10px] font-bold text-primary uppercase tracking-widest">{miners.length} {t('shop.avail_models')}</span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                {miners.map((miner) => (
                    <div key={miner.id} className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-8 shadow-xl hover:border-primary/30 transition-all duration-500 group relative overflow-hidden">
                        <div className="relative z-10 space-y-6">
                            <div className="flex justify-between items-start">
                                <div className="px-3 py-1 bg-gray-900 rounded-full border border-gray-800 text-[9px] font-black text-gray-500 uppercase tracking-widest group-hover:text-primary transition-colors">
                                    {miner.slotSize} {t('shop.slots')}
                                </div>
                                <div className="flex items-center gap-1.5 text-emerald-400">
                                    <TrendingUp className="w-3.5 h-3.5" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">ROI High</span>
                                </div>
                            </div>

                            <div className="aspect-square bg-gray-900/50 rounded-3xl p-6 border border-gray-800 group-hover:scale-105 transition-transform duration-500">
                                <img src={miner.imageUrl} alt={miner.name} className="w-full h-full object-contain" />
                            </div>

                            <div className="space-y-1">
                                <h3 className="text-xl font-black text-white truncate">{miner.name}</h3>
                                <div className="flex items-center gap-2 text-primary font-bold">
                                    <Zap className="w-4 h-4" />
                                    <span className="text-sm tabular-nums">{formatHashrate(miner.baseHashRate)}</span>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-gray-800/50 flex items-center justify-between">
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">{t('shop.price')}</span>
                                    <span className="text-lg font-black text-white italic">{miner.price} <span className="text-xs font-bold text-gray-500 not-italic uppercase">POL</span></span>
                                </div>
                                <button
                                    onClick={() => openConfirmModal(miner)}
                                    disabled={!purchasesEnabled}
                                    className="px-6 py-3 bg-primary hover:bg-primary-hover text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-primary/20 active:scale-95 disabled:opacity-50"
                                >
                                    {purchasesEnabled ? t('shop.buy') : 'Indisponível'}
                                </button>
                            </div>
                        </div>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-[100px] -z-0 translate-x-10 -translate-y-10 group-hover:translate-x-0 group-hover:translate-y-0 transition-transform duration-700"></div>
                    </div>
                ))}
            </div>

            {!purchasesEnabled && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 text-amber-300 text-sm font-semibold">
                    Compras na loja estão temporariamente desativadas. Você ainda pode visualizar os equipamentos.
                </div>
            )}

            <div className="bg-surface border border-gray-800/50 rounded-3xl p-8 shadow-xl flex items-start gap-6 max-w-2xl">
                <div className="p-4 bg-blue-500/10 rounded-2xl shrink-0">
                    <Info className="w-8 h-8 text-blue-400" />
                </div>
                <div className="space-y-2">
                    <h4 className="text-white font-black text-lg italic uppercase tracking-tighter">{t('shop.how_it_works_title')}</h4>
                    <p className="text-sm text-gray-400 leading-relaxed">
                        {t('shop.how_it_works_msg')}
                    </p>
                </div>
            </div>

            {/* Premium Confirmation Modal */}
            {showConfirmModal && selectedMiner && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-surface border border-gray-800 rounded-[3rem] w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 relative">
                        <div className="absolute top-0 right-0 p-6">
                            <button
                                onClick={() => setShowConfirmModal(false)}
                                className="p-2 text-gray-500 hover:text-white transition-colors"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="p-10 text-center space-y-8">
                            <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto border border-primary/20 shadow-glow">
                                <ShoppingCart className="w-10 h-10 text-primary" />
                            </div>

                            <div className="space-y-2">
                                <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter">Confirmar Compra</h3>
                                <p className="text-gray-500 font-medium">Você está prestes a adquirir um novo equipamento de mineração.</p>
                            </div>

                            <div className="bg-gray-900/50 border border-gray-800 rounded-3xl p-6 space-y-4">
                                <div className="flex items-center gap-4 text-left">
                                    <div className="w-16 h-16 bg-gray-800 rounded-2xl p-2 border border-gray-700">
                                        <img src={selectedMiner.imageUrl} className="w-full h-full object-contain" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-white leading-none">{selectedMiner.name}</h4>
                                        <span className="text-[10px] font-black text-primary tracking-[0.2em] mt-2 block tabular-nums">{formatHashrate(selectedMiner.baseHashRate)}</span>
                                    </div>
                                </div>
                                <div className="h-[1px] bg-gray-800 w-full" />
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Total a Pagar</span>
                                    <span className="text-xl font-black text-white italic">{selectedMiner.price} <span className="text-xs font-bold text-gray-500 not-italic uppercase">POL</span></span>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={handlePurchase}
                                    disabled={isPurchasing}
                                    className="w-full py-5 bg-primary hover:bg-primary-hover text-white rounded-[2rem] font-black text-sm uppercase tracking-[0.2em] transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-50"
                                >
                                    {isPurchasing ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <>
                                            <CheckCircle2 className="w-5 h-5" />
                                            Confirmar Pagamento
                                        </>
                                    )}
                                </button>
                                <button
                                    onClick={() => setShowConfirmModal(false)}
                                    disabled={isPurchasing}
                                    className="w-full py-4 text-gray-500 hover:text-white font-bold text-xs uppercase tracking-widest transition-colors disabled:opacity-50"
                                >
                                    Cancelar
                                </button>
                            </div>

                            <div className="flex items-center justify-center gap-2 text-amber-500/50">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span className="text-[9px] font-black uppercase tracking-widest">Esta ação é irreversível</span>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
