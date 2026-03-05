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
    ShieldAlert
} from 'lucide-react';

const adminMenuItems = [
  { icon: LayoutDashboard, label: 'Resumo', path: '/admin/dashboard' },
  { icon: Users, label: 'Usuários', path: '/admin/users' },
  { icon: Cpu, label: 'Mineradoras', path: '/admin/miners' },
  { icon: Wallet, label: 'Financeiro', path: '/admin/finance' },
  { icon: Database, label: 'Backups', path: '/admin/backups' },
  { icon: FileText, label: 'Logs', path: '/admin/logs' },
  { icon: Activity, label: 'Métricas', path: '/admin/metrics' },
];

export default function AdminSidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    // Aqui removeríamos o token de admin
    navigate('/admin/login');
  };

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 p-6 shrink-0 flex flex-col h-full shadow-2xl relative z-20">
      <div className="flex items-center gap-3 mb-10 px-2">
        <div className="w-10 h-10 bg-gradient-to-tr from-amber-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20">
          <ShieldAlert className="text-white w-6 h-6" />
        </div>
        <span className="font-black text-xl tracking-tighter text-white uppercase">Admin<span className="text-amber-500">Panel</span></span>
      </div>

      <nav className="space-y-1 flex-1">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2 mb-4">Gestão do Sistema</p>
        {adminMenuItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group ${
                isActive 
                  ? 'bg-amber-500/10 text-amber-500 shadow-sm' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <item.icon className={`w-5 h-5 transition-colors ${isActive ? 'text-amber-500' : 'group-hover:text-white'}`} />
              <span className="font-semibold text-sm">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto pt-6 border-t border-slate-800">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-red-400 hover:bg-red-400/5 rounded-xl transition-all duration-300 group"
        >
          <LogOut className="w-5 h-5 group-hover:rotate-12 transition-transform" />
          <span className="font-bold text-xs uppercase tracking-widest">Encerrar Sessão</span>
        </button>
      </div>
    </aside>
  );
}
