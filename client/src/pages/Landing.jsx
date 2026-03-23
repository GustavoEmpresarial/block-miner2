import { Link } from 'react-router-dom';
import { Pickaxe, TrendingUp, ShieldCheck, Zap } from 'lucide-react';
import { useAuthStore } from '../store/auth';

export default function Landing() {
    const { isAuthenticated } = useAuthStore();

    return (
        <div className="min-h-screen bg-background text-gray-100 flex flex-col font-sans">
            <header className="px-4 sm:px-8 py-4 sm:py-6 flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 bg-surface/80 backdrop-blur-md sticky top-0 z-50">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <div className="p-2 bg-primary/10 rounded-xl shrink-0">
                        <img src="/icon.png" alt="Block Miner Logo" className="w-6 h-6 object-contain drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                    </div>
                    <span className="text-lg sm:text-xl font-bold tracking-tight text-white truncate">Block Miner</span>
                </div>
                <nav className="w-full sm:w-auto flex justify-end">
                    {isAuthenticated ? (
                        <Link
                            to="/dashboard"
                            className="w-full sm:w-auto text-center px-6 py-2.5 bg-primary hover:bg-blue-600 text-white font-medium rounded-xl transition-colors shadow-lg shadow-primary/20 touch-manipulation"
                        >
                            Ir para Dashboard
                        </Link>
                    ) : (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4 w-full sm:w-auto">
                            <Link to="/login" className="text-center sm:text-left py-2 sm:py-0 text-gray-300 hover:text-white font-medium transition-colors touch-manipulation">Entrar</Link>
                            <Link
                                to="/register"
                                className="px-6 py-2.5 bg-primary hover:bg-blue-600 text-white font-medium rounded-xl transition-colors shadow-lg shadow-primary/20 text-center touch-manipulation"
                            >
                                Criar Conta
                            </Link>
                        </div>
                    )}
                </nav>
            </header>

            <main className="flex-1 flex flex-col">
                {/* Hero Section */}
                <section className="px-4 sm:px-8 py-16 sm:py-24 md:py-32 max-w-7xl mx-auto w-full text-center flex flex-col items-center">
                    <div className="inline-block px-4 py-1.5 mb-6 sm:mb-8 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs sm:text-sm font-semibold tracking-wide uppercase">
                        A Nova Era da Mineração
                    </div>
                    <h1 className="text-3xl sm:text-5xl md:text-7xl font-extrabold text-white mb-6 sm:mb-8 tracking-tight leading-tight max-w-4xl">
                        Minere <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-primary">Polygon (POL)</span> na Nuvem
                    </h1>
                    <p className="text-base sm:text-xl text-gray-400 mb-8 sm:mb-12 max-w-2xl leading-relaxed px-1">
                        Plataforma de cloud mining premium. Sem equipamentos, sem configurações complexas e sem consumo de energia. Comece hoje com uma máquina gratuita de 10 H/s.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 items-center">
                        <Link
                            to="/register"
                            className="px-8 py-4 bg-primary hover:bg-blue-600 text-white font-semibold rounded-2xl text-lg transition-all shadow-lg shadow-primary/20 hover:scale-105 active:scale-95"
                        >
                            Começar a Minerar Agora
                        </Link>
                        <a
                            href="#como-funciona"
                            className="px-8 py-4 bg-surface hover:bg-gray-800 text-white font-semibold rounded-2xl text-lg border border-gray-700 transition-colors"
                        >
                            Ver como funciona
                        </a>
                    </div>
                </section>

                {/* Features Section */}
                <section id="como-funciona" className="bg-surface border-y border-gray-800 py-24">
                    <div className="max-w-7xl mx-auto px-4 sm:px-8 w-full">
                        <div className="text-center mb-16">
                            <h2 className="text-3xl md:text-5xl font-bold text-white mb-4 tracking-tight">Vantagens Block Miner</h2>
                            <p className="text-lg text-gray-400">Tudo o que você precisa para multiplicar seus ganhos com criptos.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
                            <div className="bg-background border border-gray-800 p-8 rounded-3xl hover:border-gray-700 transition-colors">
                                <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center mb-6">
                                    <TrendingUp className="w-7 h-7 text-amber-500" />
                                </div>
                                <h3 className="text-xl font-bold text-white mb-3">Retorno de Alto Nível</h3>
                                <p className="text-gray-400 leading-relaxed">
                                    Adquira mineradoras poderosas e gere recompensas consistentes diretamente na sua carteira virtual na plataforma.
                                </p>
                            </div>

                            <div className="bg-background border border-gray-800 p-8 rounded-3xl hover:border-gray-700 transition-colors">
                                <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6">
                                    <Zap className="w-7 h-7 text-emerald-500" />
                                </div>
                                <h3 className="text-xl font-bold text-white mb-3">Depósitos Instantâneos</h3>
                                <p className="text-gray-400 leading-relaxed">
                                    Compre poder de mineração via CCPayment usando dezenas de redes. A aprovação ocorre em até 30 segundos usando Webhooks.
                                </p>
                            </div>

                            <div className="bg-background border border-gray-800 p-8 rounded-3xl hover:border-gray-700 transition-colors">
                                <div className="w-14 h-14 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-6">
                                    <ShieldCheck className="w-7 h-7 text-blue-500" />
                                </div>
                                <h3 className="text-xl font-bold text-white mb-3">Seguro e Transparente</h3>
                                <p className="text-gray-400 leading-relaxed">
                                    Nosso contrato de distribuição garante que as recompensas dos blocos sejam divididas de forma exata e cristalina entre os usuários ativos.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="bg-background border-t border-gray-800 py-12 px-8">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-3">
                        <img src="/icon.png" alt="Block Miner Logo" className="w-5 h-5 object-contain opacity-50 grayscale" />
                        <span className="text-gray-400 font-medium">© 2026 Block Miner.</span>
                    </div>
                    <div className="text-sm text-gray-500 font-medium tracking-wide">
                        Criado para o futuro da Polygon Cloud Mining
                    </div>
                </div>
            </footer>
        </div>
    );
}
