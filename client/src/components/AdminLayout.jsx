import { useState, useEffect } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import AdminSidebar from './AdminSidebar';
import { api } from '../store/auth';
import { MobileNavProvider, useMobileNav } from '../context/MobileNavContext';

function AdminLayoutInner() {
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(null);
  const { toggleMobileNav } = useMobileNav();

  useEffect(() => {
    const checkAdminAuth = async () => {
      try {
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
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isAdminAuthenticated === false) {
    return <Navigate to="/admin/login" replace />;
  }

  return (
    <div className="flex h-screen min-h-0 bg-slate-950 overflow-hidden text-slate-100 font-sans">
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="min-h-[4.5rem] sm:h-20 bg-slate-900/50 backdrop-blur-md border-b border-slate-800/50 flex items-center gap-3 px-3 sm:px-6 lg:px-8 py-2 sm:py-0 sticky top-0 z-10 shrink-0">
          <button
            type="button"
            onClick={toggleMobileNav}
            className="lg:hidden p-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 touch-manipulation shrink-0"
            aria-label="Abrir menu"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="min-w-0">
            <h1 className="text-base sm:text-xl font-black text-white tracking-tight uppercase truncate">Painel de Controle</h1>
            <p className="text-[9px] sm:text-[10px] text-amber-500/70 font-bold uppercase tracking-widest truncate hidden sm:block">
              Modo Administrador Ativo
            </p>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 pb-6 sm:p-4 md:p-6 lg:p-8 overscroll-contain">
          <div className="max-w-7xl mx-auto w-full min-w-0 safe-pb">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  return (
    <MobileNavProvider>
      <AdminLayoutInner />
    </MobileNavProvider>
  );
}
