import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { 
    Gift, 
    Clock, 
    Zap, 
    AlertCircle, 
    CheckCircle2, 
    Timer,
    Lock,
    Unlock,
    MousePointer2,
    Info
} from 'lucide-react';
import { api } from '../store/auth';

export default function Faucet() {
    const { t } = useTranslation();
    const [status, setStatus] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [remainingMs, setRemainingMs] = useState(0);
    const [partnerWaitMs, setPartnerWaitMs] = useState(0);
    const [canClaim, setCanClaim] = useState(false);
    const [isClaiming, setIsClaiming] = useState(false);
    const [isPartnerUnlocked, setIsPartnerUnlocked] = useState(false);
    
    const timerRef = useRef(null);
    const partnerTimerRef = useRef(null);

    const fetchStatus = useCallback(async () => {
        try {
            const res = await api.get('/faucet/status');
            if (res.data.ok) {
                setStatus(res.data);
                setRemainingMs(res.data.remainingMs || 0);
                if (res.data.remainingMs > 0) {
                    setIsPartnerUnlocked(false);
                    setCanClaim(false);
                }
            }
        } catch (err) {
            console.error("Erro ao buscar status do faucet", err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    useEffect(() => {
        if (remainingMs > 0) {
            timerRef.current = setInterval(() => {
                setRemainingMs(prev => Math.max(0, prev - 1000));
            }, 1000);
        } else {
            clearInterval(timerRef.current);
        }
        return () => clearInterval(timerRef.current);
    }, [remainingMs]);

    useEffect(() => {
        if (partnerWaitMs > 0) {
            partnerTimerRef.current = setInterval(() => {
                setPartnerWaitMs(prev => {
                    if (prev <= 1000) {
                        setIsPartnerUnlocked(true);
                        setCanClaim(remainingMs <= 0);
                        return 0;
                    }
                    return prev - 1000;
                });
            }, 1000);
        } else {
            clearInterval(partnerTimerRef.current);
        }
        return () => clearInterval(partnerTimerRef.current);
    }, [partnerWaitMs, remainingMs]);

    const handleAdClick = async () => {
        if (remainingMs > 0 || partnerWaitMs > 0 || isPartnerUnlocked) return;

        try {
            const res = await api.post('/faucet/partner/start');
            if (res.data.ok) {
                setPartnerWaitMs(res.data.waitMs || 5000);
                window.open(res.data.partnerUrl || 'https://google.com', '_blank');
            }
        } catch (err) {
            toast.error(t('common.error'));
        }
    };

    const handleClaim = async () => {
        if (!canClaim || isClaiming) return;

        try {
            setIsClaiming(true);
            const res = await api.post('/faucet/claim');
            if (res.data.ok) {
                toast.success(res.data.message || t('common.success'));
                fetchStatus();
                setIsPartnerUnlocked(false);
                setCanClaim(false);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || t('common.error'));
        } finally {
            setIsClaiming(false);
        }
    };

    const formatTime = (ms) => {
        const totalSec = Math.floor(ms / 1000);
        const min = Math.floor(totalSec / 60);
        const sec = totalSec % 60;
        return `${min}:${sec.toString().padStart(2, '0')}`;
    };

    if (isLoading) return <div className="p-8 text-gray-400">{t('common.loading')}</div>;

    const reward = status?.reward;

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="text-center space-y-4">
                <div className="inline-flex p-3 bg-primary/10 rounded-2xl mb-2">
                    <Gift className="w-8 h-8 text-primary" />
                </div>
                <h1 className="text-4xl font-black text-white tracking-tight">{t('faucet.title')}</h1>
                <p className="text-gray-500 font-medium max-w-lg mx-auto">
                    {t('faucet.subtitle')}
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-8 shadow-xl relative overflow-hidden group">
                    <div className="relative z-10">
                        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-[0.2em] mb-6">{t('faucet.avail_prize')}</h3>
                        
                        <div className="flex flex-col items-center text-center space-y-6">
                            <div className="w-40 h-40 bg-gray-900/50 rounded-3xl p-6 border border-gray-800 group-hover:border-primary/30 transition-all duration-500 group-hover:scale-105">
                                <img src={reward?.imageUrl || '/assets/machines/reward1.png'} alt={reward?.name} className="w-full h-full object-contain" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-white mb-1">{reward?.name || 'Mineradora Grátis'}</h2>
                                <div className="flex items-center justify-center gap-3 text-primary font-bold">
                                    <Zap className="w-4 h-4" />
                                    <span>{reward?.hashRate || 0} {t('faucet.ghs')}</span>
                                    <span className="text-gray-600">•</span>
                                    <span>{reward?.slotSize || 1} {t('faucet.slots')}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-[100px] -z-0"></div>
                </div>

                <div className="space-y-6">
                    <div className="bg-surface border border-gray-800/50 rounded-3xl p-8 shadow-xl">
                        {remainingMs > 0 ? (
                            <div className="text-center space-y-4">
                                <div className="flex justify-center">
                                    <div className="w-20 h-20 rounded-full border-4 border-gray-800 border-t-primary animate-spin flex items-center justify-center">
                                        <Clock className="w-8 h-8 text-primary -rotate-45" />
                                    </div>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">{t('faucet.wait_cooldown')}</p>
                                    <h3 className="text-3xl font-black text-white">{formatTime(remainingMs)}</h3>
                                </div>
                                <div className="p-4 bg-gray-800/30 rounded-2xl border border-gray-800 flex items-center gap-3 text-left">
                                    <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                                    <p className="text-[11px] text-gray-500 font-medium">
                                        {t('faucet.cooldown_msg')}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className={`p-6 rounded-[2rem] border transition-all duration-500 ${
                                    isPartnerUnlocked ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-primary/5 border-primary/20'
                                }`}>
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            {isPartnerUnlocked ? <Unlock className="w-5 h-5 text-emerald-500" /> : <Lock className="w-5 h-5 text-primary" />}
                                            <span className="text-xs font-bold text-white uppercase tracking-widest">{t('faucet.step_partner')}</span>
                                        </div>
                                        {isPartnerUnlocked && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                                    </div>
                                    <p className="text-xs text-gray-500 font-medium mb-6">{t('faucet.partner_msg')}</p>

                                    {partnerWaitMs > 0 ? (
                                        <div className="flex items-center gap-3 px-6 py-4 bg-gray-900/50 rounded-2xl border border-gray-800">
                                            <Timer className="w-5 h-5 text-primary animate-pulse" />
                                            <span className="text-sm font-bold text-white">{t('faucet.wait_seconds', { seconds: Math.ceil(partnerWaitMs / 1000) })}</span>
                                        </div>
                                    ) : isPartnerUnlocked ? (
                                        <div className="flex items-center gap-3 px-6 py-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                            <span className="text-sm font-bold text-emerald-500">{t('faucet.unlocked')}</span>
                                        </div>
                                    ) : (
                                        <button onClick={handleAdClick} className="w-full py-4 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 group">
                                            <MousePointer2 className="w-4 h-4 group-hover:scale-125 transition-transform" />
                                            {t('faucet.visit_partner')}
                                        </button>
                                    )}
                                </div>

                                <button onClick={handleClaim} disabled={!canClaim || isClaiming} className={`w-full py-6 rounded-[2rem] font-black text-sm uppercase tracking-[0.2em] transition-all shadow-xl active:scale-[0.98] flex items-center justify-center gap-3 ${
                                        canClaim ? 'bg-primary text-white shadow-primary/20 hover:bg-primary-hover' : 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700/50'
                                    }`}>
                                    {isClaiming ? t('faucet.claiming') : (
                                        <>
                                            <Gift className={`w-5 h-5 ${canClaim ? 'animate-bounce' : ''}`} />
                                            {t('faucet.claim_miner')}
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="bg-blue-500/5 border border-blue-500/10 rounded-3xl p-6 flex gap-4">
                        <Info className="w-6 h-6 text-blue-400 shrink-0" />
                        <div className="space-y-1">
                            <h4 className="text-white text-xs font-bold uppercase">{t('shop.how_it_works_title')}</h4>
                            <p className="text-[11px] text-gray-500 font-medium leading-relaxed">{t('faucet.how_it_works_msg')}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
