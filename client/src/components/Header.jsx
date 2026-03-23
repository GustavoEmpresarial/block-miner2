import { useState, useEffect, useRef } from 'react';
import { Bell, Search, Settings, MessageSquare, Menu, Check, Info, AlertTriangle, TrendingUp, Inbox } from 'lucide-react';
import { useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/game';
import { useAuthStore } from '../store/auth';
import { useMobileNav } from '../context/MobileNavContext';

export default function Header() {
  const { t } = useTranslation();
  const location = useLocation();
  const { toggleChat, notifications, markNotificationRead, fetchNotifications } = useGameStore();
  const { user } = useAuthStore();
  const { toggleMobileNav } = useMobileNav();

  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationRef = useRef(null);

  // Map route to translation key
  const getPageTitle = () => {
    const segments = location.pathname.split('/').filter(Boolean);
    if (segments.length === 0) return t('pages.overview');
    
    // Check if the first segment has a translation
    const key = `pages.${segments[0].replace('-', '_')}`;
    const translated = t(key);
    
    if (translated !== key) return translated;
    return t('pages.overview');
  };

  const title = getPageTitle();
  const unreadCount = notifications.filter(n => !n.isRead).length;

  useEffect(() => {
    fetchNotifications();
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [fetchNotifications]);

  const handleMarkAllRead = () => {
    markNotificationRead('all');
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'success': return <Check className="w-4 h-4 text-emerald-400" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      case 'reward': return <TrendingUp className="w-4 h-4 text-primary" />;
      default: return <Info className="w-4 h-4 text-blue-400" />;
    }
  };

  return (
    <header className="min-h-[4.5rem] sm:h-20 bg-background/80 backdrop-blur-md border-b border-gray-800/50 flex items-center gap-2 sm:gap-4 px-3 sm:px-6 lg:px-8 py-2 sm:py-0 sticky top-0 z-30 shrink-0">
      <button
        type="button"
        onClick={toggleMobileNav}
        className="lg:hidden p-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800/50 transition-all touch-manipulation shrink-0"
        aria-label="Abrir menu"
      >
        <Menu className="w-6 h-6" />
      </button>
      <div className="flex flex-col min-w-0 flex-1 lg:flex-none">
        <h1 className="text-base sm:text-xl font-bold text-white tracking-tight truncate">{title}</h1>
        <p className="text-[10px] sm:text-[11px] text-gray-500 font-medium truncate hidden sm:block">Protocolo de mineração ativo.</p>
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-4 lg:gap-6 shrink-0">
        <div className="relative hidden lg:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar no sistema..."
            className="bg-gray-800/30 border border-gray-800/50 rounded-xl py-2 pl-10 pr-4 text-sm text-gray-300 focus:outline-none focus:border-primary/50 transition-colors w-64"
          />
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3 border-l border-gray-800/50 pl-2 sm:pl-4 lg:pl-6">
          <button
            type="button"
            onClick={toggleChat}
            className="p-2 sm:p-2.5 text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-xl transition-all relative group touch-manipulation"
            title="Comunidade"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
          
          {/* Notification Bell */}
          <div className="relative" ref={notificationRef}>
            <button
              type="button"
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
              className={`p-2 sm:p-2.5 rounded-xl transition-all relative group touch-manipulation ${isNotificationsOpen ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-background animate-pulse" />
              )}
            </button>

            {/* Notification Dropdown */}
            {isNotificationsOpen && (
              <div className="fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 top-[4.5rem] sm:top-full mt-0 sm:mt-3 w-auto sm:w-80 max-w-none sm:max-w-[20rem] bg-surface border border-gray-800 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 z-50 max-h-[min(70vh,28rem)] flex flex-col">
                <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between bg-gray-900/50">
                  <h3 className="text-xs font-black text-white uppercase tracking-widest">Notificações</h3>
                  {unreadCount > 0 && (
                    <button 
                      onClick={handleMarkAllRead}
                      className="text-[10px] font-bold text-primary hover:text-primary-hover transition-colors uppercase tracking-tighter"
                    >
                      Ler todas
                    </button>
                  )}
                </div>

                <div className="flex-1 min-h-0 max-h-[min(55vh,22rem)] sm:max-h-[400px] overflow-y-auto scrollbar-hide">
                  {notifications.length === 0 ? (
                    <div className="py-12 flex flex-col items-center justify-center text-gray-600 space-y-3">
                      <Inbox className="w-10 h-10 opacity-20" />
                      <p className="text-[10px] font-bold uppercase tracking-widest italic">Nenhum alerta pendente</p>
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div 
                        key={n.id} 
                        className={`px-6 py-4 border-b border-gray-800/30 hover:bg-gray-800/30 transition-colors relative group ${!n.isRead ? 'bg-primary/5' : ''}`}
                        onClick={() => markNotificationRead(n.id)}
                      >
                        <div className="flex gap-4">
                          <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center bg-gray-900 border border-gray-800`}>
                            {getNotificationIcon(n.type)}
                          </div>
                          <div className="space-y-1 min-w-0">
                            <p className={`text-xs font-bold leading-tight truncate ${!n.isRead ? 'text-white' : 'text-gray-400'}`}>
                              {n.title}
                            </p>
                            <p className="text-[11px] text-gray-500 leading-normal line-clamp-2">
                              {n.message}
                            </p>
                            <p className="text-[9px] text-gray-600 font-medium">
                              {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                        {!n.isRead && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-primary rounded-full" />
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="px-6 py-3 bg-gray-900/30 text-center">
                  <span className="text-[9px] font-black text-gray-600 uppercase tracking-[0.2em]">Block Miner Intelligence</span>
                </div>
              </div>
            )}
          </div>

          <Link
            to="/settings"
            className="p-2 sm:p-2.5 text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-xl transition-all touch-manipulation"
            title="Configurações"
          >
            <Settings className="w-5 h-5" />
          </Link>

          {/* User Profile Section */}
          <div className="flex items-center gap-3 pl-3 ml-2 border-l border-gray-800/50">
            <div className="flex flex-col items-end hidden sm:flex">
              <span className="text-sm font-black text-white leading-none tracking-tighter uppercase italic">{user?.username || user?.name}</span>
              <span className="text-[9px] font-bold text-primary uppercase tracking-[0.2em] mt-1">Nível 1</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center text-white font-black border border-gray-700 shadow-xl overflow-hidden ring-2 ring-primary/20">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
