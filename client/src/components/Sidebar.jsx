import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  ShoppingCart,
  Cpu,
  Wallet,
  LogOut,
  Gift,
  Link as LinkIcon,
  Calendar,
  Youtube,
  MousePointer2,
  Trophy
} from 'lucide-react';
import { useAuthStore } from '../store/auth';

export default function Sidebar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();

  const menuItems = [
    { icon: LayoutDashboard, label: t('sidebar.dashboard'), path: '/dashboard' },
    { icon: Cpu, label: t('sidebar.machines'), path: '/inventory' },
    { icon: ShoppingCart, label: t('sidebar.shop'), path: '/shop' },
    { icon: Wallet, label: t('sidebar.wallet'), path: '/wallet' },
    { icon: Calendar, label: 'Check-in', path: '/checkin' },
    { icon: Gift, label: t('sidebar.faucet'), path: '/faucet' },
    { icon: LinkIcon, label: t('sidebar.shortlinks'), path: '/shortlinks' },
    { icon: MousePointer2, label: 'Ofertas/PTC', path: '/offerwalls' },
    { icon: Youtube, label: 'YouTube', path: '/youtube' },
    { icon: Trophy, label: 'Ranking', path: '/ranking' },
  ];

  return (
    <aside className="w-72 bg-surface border-r border-gray-800/50 p-6 shrink-0 flex flex-col h-full shadow-2xl relative z-20">
      <div className="flex items-center gap-3 mb-10 px-2">
        <div className="w-10 h-10 bg-gradient-to-tr from-primary to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 overflow-hidden">
          <img src="/icon.png" alt="Logo" className="w-6 h-6 object-contain" />
        </div>
        <span className="font-black text-2xl tracking-tighter text-white">BLOCK<span className="text-primary">MINER</span></span>
      </div>

      <nav className="space-y-2 flex-1">
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-2 mb-4">{t('sidebar.menu_title')}</p>
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-all duration-300 group ${isActive
                ? 'bg-primary/10 text-primary shadow-sm'
                : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                }`}
            >
              <div className="flex items-center gap-3">
                <item.icon className={`w-5 h-5 transition-colors ${isActive ? 'text-primary' : 'group-hover:text-white'}`} />
                <span className="font-medium text-sm">{item.label}</span>
              </div>
              {isActive && <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-glow" />}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto pt-6 border-t border-gray-800/50">
        <div className="bg-gray-800/30 rounded-2xl p-4 mb-4 flex items-center gap-3 border border-gray-800/50">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-white font-bold border border-gray-700">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate">{user?.name}</p>
            <p className="text-[10px] text-gray-500 truncate font-medium">Minerador Nível 1</p>
          </div>
        </div>

        <button
          onClick={() => logout()}
          className="w-full flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-red-400 hover:bg-red-400/5 rounded-xl transition-all duration-300 group"
        >
          <LogOut className="w-5 h-5 group-hover:rotate-12 transition-transform" />
          <span className="font-medium text-sm">{t('common.logout')}</span>
        </button>
      </div>
    </aside>
  );
}
