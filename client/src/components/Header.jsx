import { Bell, Search, Settings, MessageSquare } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useGameStore } from '../store/game';

const pageTitles = {
  '/dashboard': 'Dashboard Central',
  '/shop': 'Loja de Equipamentos',
  '/inventory': 'Minhas Máquinas',
  '/wallet': 'Carteira Digital',
};

export default function Header() {
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'Visão Geral';
  const { toggleChat } = useGameStore();

  return (
    <header className="h-20 bg-background/80 backdrop-blur-md border-b border-gray-800/50 flex items-center px-8 sticky top-0 z-10">
      <div className="flex flex-col">
        <h1 className="text-xl font-bold text-white tracking-tight">{title}</h1>
        <p className="text-[11px] text-gray-500 font-medium">Bem-vindo de volta ao sistema de mineração.</p>
      </div>

      <div className="ml-auto flex items-center gap-4">
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar..."
            className="bg-gray-800/30 border border-gray-800/50 rounded-xl py-2 pl-10 pr-4 text-sm text-gray-300 focus:outline-none focus:border-primary/50 transition-colors w-64"
          />
        </div>

        <div className="flex items-center gap-2 border-l border-gray-800/50 pl-4">
          <button
            onClick={toggleChat}
            className="p-2.5 text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-xl transition-all relative group"
            title="Abrir Comunidade"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
          <button className="p-2.5 text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-xl transition-all relative group">
            <Bell className="w-5 h-5" />
            <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full border-2 border-background" />
          </button>
          <button className="p-2.5 text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-xl transition-all">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
