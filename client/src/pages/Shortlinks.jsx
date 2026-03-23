import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
    Link as LinkIcon,
    Zap,
    CheckCircle2,
    AlertCircle,
    ShieldCheck,
    Clock,
    ArrowRight
} from 'lucide-react';
import { api } from '../store/auth';
import { useNavigate } from 'react-router-dom';

export default function Shortlinks() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [status, setStatus] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isStarting, setIsStarting] = useState(false);

    const fetchStatus = useCallback(async () => {
        try {
            const res = await api.get('/shortlink/status');
            if (res.data.ok) {
                setStatus(res.data.status);
            }
        } catch (err) {
            console.error("Erro ao buscar status do shortlink", err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    const handleStart = async () => {
        if (!status || isStarting) return;

        try {
            setIsStarting(true);
            const res = await api.post('/shortlink/start');
            if (res.data.ok) {
                // Initialize multi-URL session
                const initialSession = {
                    token: res.data.sessionToken,
                    currentStep: 1
                };
                sessionStorage.setItem('sl_session', JSON.stringify(initialSession));
                // Navigate to the FIRST STEP URL
                navigate("/shortlink/internal-shortlink/step/1");
            }
        } catch (err) {
            toast.error(err.response?.data?.message || t('common.error'));
        } finally {
            setIsStarting(false);
        }
    };

    if (isLoading) return <div className="p-8 text-gray-400">{t('common.loading')}</div>;

    const runsToday = status?.dailyRuns || 0;
    const maxRuns = status?.maxDailyRuns || 1;
    const isLimitReached = runsToday >= maxRuns && (status?.currentStep || 0) === 0;
    const inProgress = status?.inProgress;

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <div className="inline-flex p-3 bg-blue-500/10 rounded-2xl">
                        <LinkIcon className="w-6 h-6 text-blue-400" />
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tight">{t('shortlinks.title')}</h1>
                    <p className="text-gray-500 font-medium">{t('shortlinks.subtitle')}</p>
                </div>
                <div className="flex items-center gap-3 px-4 py-2 bg-gray-800/50 border border-gray-700/50 rounded-xl">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('shortlinks.verified_links')}</span>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
                <div className={`bg-surface border rounded-[2.5rem] p-10 shadow-xl transition-all duration-500 ${isLimitReached ? 'border-gray-800 opacity-80' : 'border-primary/20 hover:border-primary/40'
                    }`}>
                    <div className="flex flex-col md:flex-row justify-between gap-8">
                        <div className="space-y-6 flex-1">
                            <div className="flex items-center gap-4">
                                <div className="p-4 bg-gray-900/50 rounded-2xl border border-gray-800">
                                    <Zap className="w-8 h-8 text-primary" />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-white">{status?.shortlinkName || 'Internal Shortlink'}</h3>
                                    <p className="text-sm font-bold text-primary mt-1">{t('shortlinks.reward')}: {status?.rewardName || '5 H/s Miner'}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                <div className="bg-gray-800/20 p-4 rounded-2xl border border-gray-800/50">
                                    <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">{t('shortlinks.status_label')}</p>
                                    <p className={`text-sm font-bold ${isLimitReached ? 'text-red-400' : 'text-emerald-400'}`}>
                                        {isLimitReached ? t('shortlinks.limit_reached') : inProgress ? t('shortlinks.in_progress') : t('shortlinks.available')}
                                    </p>
                                </div>
                                <div className="bg-gray-800/20 p-4 rounded-2xl border border-gray-800/50">
                                    <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">{t('shortlinks.daily_usage')}</p>
                                    <p className="text-sm font-bold text-white">{runsToday} / {maxRuns}</p>
                                </div>
                                <div className="hidden md:block bg-gray-800/20 p-4 rounded-2xl border border-gray-800/50">
                                    <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">{t('shortlinks.difficulty')}</p>
                                    <div className="flex gap-1 mt-1">
                                        <div className="w-3 h-1.5 bg-primary rounded-full" />
                                        <div className="w-3 h-1.5 bg-primary rounded-full" />
                                        <div className="w-3 h-1.5 bg-gray-700 rounded-full" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col justify-center gap-4 md:w-64">
                            {isLimitReached ? (
                                <div className="p-6 bg-red-500/5 border border-red-500/10 rounded-3xl text-center space-y-2">
                                    <Clock className="w-8 h-8 text-red-400 mx-auto" />
                                    <p className="text-xs font-bold text-gray-400">{t('shortlinks.wait_reset')}</p>
                                </div>
                            ) : (
                                <button onClick={handleStart} disabled={isStarting} className="w-full py-6 bg-primary hover:bg-primary-hover text-white rounded-[2rem] font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-primary/20 active:scale-[0.98] flex items-center justify-center gap-3">
                                    {isStarting ? t('shortlinks.starting') : (
                                        <>
                                            {inProgress ? t('shortlinks.continue_link') : t('shortlinks.start_link')}
                                            <ArrowRight className="w-5 h-5" />
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="bg-gray-800/30 border border-gray-800 rounded-3xl p-8 flex items-start gap-6">
                    <div className="p-4 bg-blue-500/10 rounded-2xl shrink-0">
                        <AlertCircle className="w-8 h-8 text-blue-400" />
                    </div>
                    <div className="space-y-2">
                        <h4 className="text-white font-black text-lg">{t('shortlinks.what_is_shortlink')}</h4>
                        <p className="text-sm text-gray-500 leading-relaxed font-medium">{t('shortlinks.shortlink_msg')}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
