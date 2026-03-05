import { useState, useEffect } from 'react';
import { useNavigate, Outlet, Navigate } from 'react-router-dom';
import AdminSidebar from '../components/AdminSidebar';
import { api } from '../store/auth';

export default function AdminLayout() {
    const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        const checkAdminAuth = async () => {
            try {
                // Rota que verifica se o cookie de admin_session é válido
                const res = await api.get('/admin/auth/check');
                setIsAdminAuthenticated(res.data.ok);
            } catch (err) {
                setIsAdminAuthenticated(false);
            }
        };
        checkAdminAuth();
    }, []);

    if (isAdminAuthenticated === null) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (isAdminAuthenticated === false) {
        return <Navigate to="/admin/login" replace />;
    }

    return (
        <div className="flex h-screen bg-slate-950 overflow-hidden text-slate-100 font-sans">
            <AdminSidebar />
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <header className="h-20 bg-slate-900/50 backdrop-blur-md border-b border-slate-800/50 flex items-center px-8 sticky top-0 z-10">
                    <div>
                        <h1 className="text-xl font-black text-white tracking-tight uppercase">Painel de Controle</h1>
                        <p className="text-[10px] text-amber-500/70 font-bold uppercase tracking-widest">Modo Administrador Ativo</p>
                    </div>
                </header>
                <main className="flex-1 overflow-y-auto p-8">
                    <div className="max-w-7xl mx-auto">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}
