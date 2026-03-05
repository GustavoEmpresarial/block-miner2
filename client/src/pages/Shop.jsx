import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { ShoppingCart, Zap, TrendingUp, Info } from 'lucide-react';
import { api } from '../store/auth';
import { useGameStore } from '../store/game';

export default function Shop() {
    const { t } = useTranslation();
    const [miners, setMiners] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isPurchasing, setIsPurchasing] = useState(false);
    const { fetchAll } = useGameStore();

    useEffect(() => {
        const fetchMiners = async () => {
            try {
                const res = await api.get('/shop/miners');
                if (res.data.ok) {
                    setMiners(res.data.miners);
                }
            } catch (err) {
                console.error("Erro ao buscar mineradoras", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchMiners();
    }, []);

    const handlePurchase = async (minerId) => {
        if (isPurchasing) return;
        if (!confirm(t('shop.confirm_purchase'))) return;

        try {
            setIsPurchasing(true);
            const res = await api.post('/shop/purchase', { minerId });
            if (res.data.ok) {
                toast.success(res.data.message || t('shop.purchase_success'));
                fetchAll(); // Refresh balance and inventory
            }
        } catch (err) {
            toast.error(err.response?.data?.message || t('common.error'));
        } finally {
            setIsPurchasing(false);
        }
    };

    if (isLoading) return <div className="p-8 text-gray-400">{t('common.loading')}</div>;

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
                                    <span className="text-sm">{miner.baseHashRate} GH/S</span>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-gray-800/50 flex items-center justify-between">
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">{t('shop.price')}</span>
                                    <span className="text-lg font-black text-white italic">{miner.price} <span className="text-xs font-bold text-gray-500 not-italic uppercase">POL</span></span>
                                </div>
                                <button 
                                    onClick={() => handlePurchase(miner.id)}
                                    disabled={isPurchasing}
                                    className="px-6 py-3 bg-primary hover:bg-primary-hover text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-primary/20 active:scale-95 disabled:opacity-50"
                                >
                                    {t('shop.buy')}
                                </button>
                            </div>
                        </div>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-[100px] -z-0 translate-x-10 -translate-y-10 group-hover:translate-x-0 group-hover:translate-y-0 transition-transform duration-700"></div>
                    </div>
                ))}
            </div>

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
        </div>
    );
}
