import { useNavigate, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    Users,
    Cpu,
    Wallet,
    Database,
    FileText,
    Activity,
    LogOut,
    ShieldAlert,
    X,
    Inbox
} from 'lucide-react';
import { useMobileNav } from '../context/MobileNavContext';

const adminMenuItems = [
  { icon: LayoutDashboard, label: 'Resumo', path: '/admin/dashboard' },
  { icon: Users, label: 'Usuários', path: '/admin/users' },
  { icon: Cpu, label: 'Mineradoras', path: '/admin/miners' },
  { icon: Wallet, label: 'Financeiro', path: '/admin/finance' },
  { icon: Inbox, label: 'Suporte (tickets)', path: '/admin/support' },
  { icon: Database, label: 'Backups', path: '/admin/backups' },
  { icon: FileText, label: 'Logs', path: '/admin/logs' },
  { icon: Activity, label: 'Métricas', path: '/admin/metrics' },
];

export default function AdminSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { mobileNavOpen, closeMobileNav } = useMobileNav();

  const handleLogout = () => {
    closeMobileNav();
    navigate('/admin/login');
  };

  const go = (path) => {
    navigate(path);
    closeMobileNav();
  };

  return (
    <>
      <div
        role="presentation"
        aria-hidden={!mobileNavOpen}
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity lg:hidden ${mobileNavOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={closeMobileNav}
      />
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-[min(18rem,88vw)] max-w-[18rem] bg-slate-900 border-r border-slate-800 p-4 sm:p-6 shrink-0 flex flex-col h-full shadow-2xl transition-transform duration-300 ease-out lg:translate-x-0 ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className="flex items-center justify-between gap-3 mb-6 lg:mb-10 px-0 sm:px-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-gradient-to-tr from-amber-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0">
              <ShieldAlert className="text-white w-6 h-6" />
            </div>
            <span className="font-black text-lg sm:text-xl tracking-tighter text-white uppercase truncate">Admin<span className="text-amber-500">Panel</span></span>
          </div>
          <button
            type="button"
            onClick={closeMobileNav}
            className="lg:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 shrink-0"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="space-y-1 flex-1 overflow-y-auto overscroll-contain min-h-0">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2 mb-4">Gestão do Sistema</p>
          {adminMenuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => go(item.path)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group touch-manipulation min-h-[44px] ${
                  isActive
                    ? 'bg-amber-500/10 text-amber-500 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <item.icon className={`w-5 h-5 transition-colors shrink-0 ${isActive ? 'text-amber-500' : 'group-hover:text-white'}`} />
                <span className="font-semibold text-sm text-left">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto pt-4 sm:pt-6 border-t border-slate-800 safe-pb">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-red-400 hover:bg-red-400/5 rounded-xl transition-all duration-300 group touch-manipulation min-h-[44px]"
          >
            <LogOut className="w-5 h-5 group-hover:rotate-12 transition-transform shrink-0" />
            <span className="font-bold text-xs uppercase tracking-widest">Encerrar Sessão</span>
          </button>
        </div>
      </aside>
    </>
  );
}
