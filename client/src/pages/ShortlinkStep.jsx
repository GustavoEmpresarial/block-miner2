import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Timer, ArrowRight, ShieldCheck, Zap, Loader2, AlertTriangle } from 'lucide-react';
import { api } from '../store/auth';

export default function ShortlinkStep() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    
    const [session, setSession] = useState(location.state || null);
    const [timeLeft, setTimeLeft] = useState(10);
    const [isProcessing, setIsProcessing] = useState(false);
    const [canProceed, setCanProceed] = useState(false);
    const timerRef = useRef(null);

    useEffect(() => {
        if (!session?.token) {
            toast.error("Invalid session. Start again.");
            navigate('/shortlinks');
        }
    }, [session, navigate]);

    useEffect(() => {
        setCanProceed(false);
        setTimeLeft(10);
        
        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    setCanProceed(true);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timerRef.current);
    }, [session?.currentStep]);

    const handleNext = async (e) => {
        if (!canProceed || isProcessing) return;

        // --- SEGURANÇA: COLETAR TELEMETRIA ---
        const securityFlags = {
            // Se isTrusted for false, o evento foi disparado via script (element.click())
            isUntrustedEvent: !e.isTrusted,
            // Detecta se o navegador está em modo automação (Puppeteer/Playwright/Selenium)
            isAutomated: navigator.webdriver || !!document.documentElement.getAttribute('webdriver')
        };

        try {
            setIsProcessing(true);
            const res = await api.post('/shortlink/complete-step', { 
                step: session.currentStep,
                sessionToken: session.token,
                securityFlags // Envia sinais de comportamento humano
            });
            
            if (res.data.ok) {
                if (res.data.runCompleted) {
                    toast.success(res.data.reward?.message || 'Shortlink completed!');
                    navigate('/inventory');
                } else {
                    const nextSession = {
                        token: res.data.sessionToken,
                        currentStep: session.currentStep + 1
                    };
                    setSession(nextSession);
                    window.history.replaceState(nextSession, '');
                }
            }
        } catch (err) {
            const msg = err.response?.data?.message || t('common.error');
            toast.error(msg);
            // Se o servidor detectar fraude, ele envia flag 'kick'
            if (err.response?.data?.kick || err.response?.status === 403) {
                navigate('/shortlinks');
            }
        } finally {
            setIsProcessing(false);
        }
    };

    if (!session) return null;

    return (
        <div className="min-h-[80vh] flex items-center justify-center p-6">
            <div className="w-full max-w-md bg-surface border border-gray-800 rounded-[2.5rem] p-10 shadow-2xl space-y-8 text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-gray-800">
                    <div 
                        className="h-full bg-primary transition-all duration-1000 ease-linear" 
                        style={{ width: `${((session.currentStep - 1) / 3) * 100 + ((10 - timeLeft) / 10) * (100/3)}%` }}
                    />
                </div>

                <div className="space-y-4">
                    <div className="inline-flex p-4 bg-primary/10 rounded-2xl">
                        <Zap className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter">
                            Verification Step {session.currentStep}
                        </h2>
                        <p className="text-gray-500 font-medium mt-1">Please wait for the secure validation</p>
                    </div>
                </div>

                <div className="py-10 flex flex-col items-center justify-center">
                    {!canProceed ? (
                        <div className="flex flex-col items-center">
                            <div className="relative w-24 h-24 flex items-center justify-center">
                                <div className="absolute inset-0 rounded-full border-4 border-gray-800 border-t-primary animate-spin" />
                                <span className="text-3xl font-black text-white">{timeLeft}</span>
                            </div>
                            <p className="mt-6 text-[10px] font-black text-primary animate-pulse uppercase tracking-[0.2em]">Analyzing Behavior...</p>
                        </div>
                    ) : (
                        <div className="space-y-4 animate-in zoom-in duration-500">
                            <div className="w-24 h-24 mx-auto rounded-full bg-emerald-500/10 border-4 border-emerald-500/20 flex items-center justify-center">
                                <ShieldCheck className="w-12 h-12 text-emerald-500" />
                            </div>
                            <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest">Safe to Proceed</p>
                        </div>
                    )}
                </div>

                <div className="space-y-4">
                    <button
                        onClick={handleNext}
                        disabled={!canProceed || isProcessing}
                        className={`w-full py-6 rounded-[2rem] font-black text-sm uppercase tracking-widest transition-all shadow-xl flex items-center justify-center gap-3 ${
                            canProceed && !isProcessing
                                ? 'bg-primary text-white shadow-primary/20 hover:bg-primary-hover active:scale-[0.98]'
                                : 'bg-gray-800 text-gray-500 cursor-not-allowed opacity-50'
                        }`}
                    >
                        {isProcessing ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                {session.currentStep === 3 ? 'CLAIM FINAL REWARD' : 'CONTINUE TO NEXT STEP'}
                                <ArrowRight className="w-5 h-5" />
                            </>
                        )}
                    </button>

                    <div className="flex items-center justify-center gap-2 text-slate-600">
                        <AlertTriangle className="w-3 h-3" />
                        <span className="text-[9px] font-bold uppercase tracking-tighter">Automated scripts will trigger a permanent ban</span>
                    </div>
                </div>

                <p className="text-[10px] text-gray-700 font-bold uppercase tracking-widest">
                    SECURE SHIELD ACTIVE • NO BOTS ALLOWED
                </p>
            </div>
        </div>
    );
}
