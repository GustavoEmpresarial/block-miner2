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
  Trophy,
  Gamepad2,
  ChevronRight,
  Zap,
  X
} from 'lucide-react';
import { useAuthStore } from '../store/auth';
import { useMobileNav } from '../context/MobileNavContext';

export default function Sidebar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuthStore();
  const { mobileNavOpen, closeMobileNav } = useMobileNav();

  const categories = [
    {
      title: t('sidebar.categories.main', 'Principal'),
      items: [
        { icon: LayoutDashboard, label: t('sidebar.dashboard'), path: '/dashboard' },
        { icon: Cpu, label: t('sidebar.machines'), path: '/inventory' },
        { icon: ShoppingCart, label: t('sidebar.shop'), path: '/shop' },
        { icon: Wallet, label: t('sidebar.wallet'), path: '/wallet' },
      ]
    },
    {
      title: t('sidebar.categories.earn', 'Ganhar'),
      items: [
        { icon: Calendar, label: t('sidebar.checkin', 'Check-in'), path: '/checkin' },
        { icon: Gift, label: t('sidebar.faucet'), path: '/faucet' },
        { icon: LinkIcon, label: t('sidebar.shortlinks'), path: '/shortlinks' },
        { icon: Zap, label: t('sidebar.auto_mining', 'Auto Mining'), path: '/auto-mining' },
        { icon: Youtube, label: t('sidebar.youtube', 'YouTube'), path: '/youtube' },
      ]
    },
    {
      title: t('sidebar.categories.social', 'Social & Fun'),
      items: [
        { icon: Gamepad2, label: t('sidebar.games', 'Jogos'), path: '/games' },
        { icon: Trophy, label: t('sidebar.ranking', 'Ranking'), path: '/ranking' },
      ]
    }
  ];

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
        className={`fixed lg:static inset-y-0 left-0 z-50 w-[min(18rem,88vw)] max-w-[18rem] bg-surface border-r border-gray-800/50 shrink-0 flex flex-col h-full shadow-2xl transition-transform duration-300 ease-out lg:translate-x-0 ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Brand Logo */}
        <div className="flex items-center justify-between gap-3 p-4 sm:p-6 lg:p-8 border-b border-gray-800/30 lg:border-b-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-gradient-to-tr from-primary to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
              <img src="/icon.png" alt="Logo" className="w-6 h-6 object-contain" />
            </div>
            <span className="font-black text-xl sm:text-2xl tracking-tighter text-white italic truncate">BLOCK<span className="text-primary">MINER</span></span>
          </div>
          <button
            type="button"
            onClick={closeMobileNav}
            className="lg:hidden p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800/60 shrink-0"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 sm:px-4 space-y-6 sm:space-y-8 scrollbar-hide pb-6 sm:pb-8 overscroll-contain">
        {categories.map((category) => (
          <div key={category.title} className="space-y-2">
            <h3 className="text-[9px] font-black text-gray-600 uppercase tracking-[0.3em] px-4 mb-4">{category.title}</h3>
            <div className="space-y-1">
              {category.items.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => go(item.path)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all duration-300 group touch-manipulation min-h-[44px] ${isActive
                      ? 'bg-primary/10 text-primary border border-primary/10'
                      : 'text-gray-500 hover:text-white hover:bg-gray-800/40'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className={`w-4 h-4 transition-colors ${isActive ? 'text-primary' : 'group-hover:text-primary'}`} />
                      <span className={`text-xs font-bold uppercase tracking-wide ${isActive ? 'text-white' : ''}`}>{item.label}</span>
                    </div>
                    {isActive ? (
                        <div className="w-1 h-4 bg-primary rounded-full shadow-glow" />
                    ) : (
                        <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-gray-600" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer / Logout */}
      <div className="p-3 sm:p-4 mt-auto border-t border-gray-800/50 safe-pb">
        <button
          type="button"
          onClick={() => {
            closeMobileNav();
            logout();
          }}
          className="w-full flex items-center gap-3 px-4 py-4 text-gray-500 hover:text-red-400 hover:bg-red-400/5 rounded-2xl transition-all duration-300 group touch-manipulation min-h-[44px]"
        >
          <LogOut className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="font-bold text-xs uppercase tracking-widest">{t('common.logout')}</span>
        </button>
      </div>
    </aside>
    </>
  );
}
