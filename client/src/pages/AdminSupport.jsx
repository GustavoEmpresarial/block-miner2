
import { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Search, 
  Filter, 
  ChevronRight, 
  Clock, 
  User, 
  Mail, 
  Send,
  CheckCircle2,
  AlertCircle,
  Inbox,
  Settings,
  X,
  RefreshCw,
  Loader2,
  KeyRound
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../store/auth';

export default function AdminSupport() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [reply, setReply] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all, unread, replied
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [sendingResetLink, setSendingResetLink] = useState(false);

  const isPasswordResetTicket = (subject) =>
    String(subject || '').includes('[Senha]');

  useEffect(() => {
    fetchMessages();
  }, []);

  const fetchMessages = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/support');
      if (res.data.ok) {
        setMessages(res.data.messages);
      }
    } catch (error) {
      toast.error('Erro ao carregar mensagens');
    } finally {
      setLoading(false);
    }
  };

  const selectMessage = async (msg) => {
    setLoadingDetails(true);
    setReply('');
    try {
      const res = await api.get(`/admin/support/${msg.id}`);
      if (res.data.ok) {
        setSelectedMessage(res.data.message);
        if (!msg.isRead) {
          setMessages(messages.map(m => m.id === msg.id ? { ...m, isRead: true } : m));
        }
      }
    } catch (error) {
      toast.error('Erro ao carregar detalhes');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleSendResetLink = async () => {
    if (!selectedMessage?.id) return;
    setSendingResetLink(true);
    try {
      const res = await api.post(`/admin/support/${selectedMessage.id}/send-reset-link`);
      if (res.data.ok) {
        toast.success(res.data.message || 'Link enviado.');
        const detailsRes = await api.get(`/admin/support/${selectedMessage.id}`);
        if (detailsRes.data.ok) {
          setSelectedMessage(detailsRes.data.message);
          setMessages((prev) =>
            prev.map((m) => (m.id === selectedMessage.id ? { ...m, isReplied: true } : m))
          );
        }
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Falha ao enviar o link.');
    } finally {
      setSendingResetLink(false);
    }
  };

  const handleReply = async () => {
    if (!reply.trim()) return;
    setSendingReply(true);
    try {
      const res = await api.post(`/admin/support/${selectedMessage.id}/reply`, { reply });
      if (res.data.ok) {
        toast.success('Resposta enviada com sucesso!');
        // Refresh details
        const detailsRes = await api.get(`/admin/support/${selectedMessage.id}`);
        if (detailsRes.data.ok) {
          const updatedFull = detailsRes.data.message;
          setSelectedMessage(updatedFull);
          setMessages(messages.map(m => m.id === updatedFull.id ? { ...m, isReplied: true } : m));
        }
        setReply('');
      }
    } catch (error) {
      toast.error('Erro ao enviar resposta');
    } finally {
      setSendingReply(false);
    }
  };

  const filteredMessages = messages.filter(msg => {
    const matchesSearch = (msg.subject || '').toLowerCase().includes(search.toLowerCase()) || 
                          (msg.name || '').toLowerCase().includes(search.toLowerCase()) ||
                          (msg.email || '').toLowerCase().includes(search.toLowerCase());
    
    if (filter === 'unread') return matchesSearch && !msg.isRead;
    if (filter === 'replied') return matchesSearch && msg.isReplied;
    if (filter === 'pending') return matchesSearch && !msg.isReplied;
    return matchesSearch;
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <Inbox className="w-8 h-8 text-amber-500" />
            SUPORTE <span className="text-amber-500/50">TICKETS</span>
          </h1>
          <p className="text-slate-500 font-medium">Gerencie as solicitações de suporte dos usuários em formato de chat</p>
        </div>
        <button 
          onClick={fetchMessages}
          className="flex items-center gap-2 px-6 py-3 bg-slate-900 border border-slate-800 hover:border-amber-500/50 text-slate-300 hover:text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-xl"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> ATUALIZAR
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-250px)]">
        {/* Sidebar: Message List */}
        <div className="lg:col-span-4 flex flex-col space-y-4 overflow-hidden">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input 
                type="text" 
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors"
              />
            </div>
            <select 
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 text-xs text-slate-300 focus:outline-none"
            >
              <option value="all">Todas</option>
              <option value="unread">Não Lidas</option>
              <option value="pending">Pendentes</option>
              <option value="replied">Respondidas</option>
            </select>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-slate-800">
            {loading && messages.length === 0 ? (
              [...Array(5)].map((_, i) => (
                <div key={i} className="h-20 bg-slate-900/50 rounded-2xl animate-pulse" />
              ))
            ) : filteredMessages.length === 0 ? (
              <div className="text-center py-10 opacity-50">Nenhuma mensagem encontrada</div>
            ) : (
              filteredMessages.map((msg) => (
                <button
                  key={msg.id}
                  onClick={() => selectMessage(msg)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all duration-300 ${
                    selectedMessage?.id === msg.id 
                    ? 'bg-amber-500/10 border-amber-500/30' 
                    : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter ${
                      msg.isReplied ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
                    }`}>
                      {msg.isReplied ? 'Respondido' : 'Pendente'}
                    </span>
                    {!msg.isRead && <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse shadow-lg shadow-amber-500/50" />}
                  </div>
                  <h3 className="text-white font-bold text-sm truncate">{msg.subject}</h3>
                  <div className="flex items-center gap-2 mt-2 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                    <User className="w-3 h-3" />
                    <span className="truncate">{msg.name}</span>
                    <Clock className="w-3 h-3 ml-auto" />
                    <span>{new Date(msg.createdAt).toLocaleDateString()}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Content: Selected Message */}
        <div className="lg:col-span-8 bg-slate-950/50 border border-slate-800 rounded-3xl overflow-hidden flex flex-col">
          {loadingDetails ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
            </div>
          ) : selectedMessage ? (
            <div className="flex-1 flex flex-col p-8 overflow-hidden">
              <div className="flex justify-between items-start border-b border-slate-800 pb-6 mb-6">
                <div className="space-y-1">
                  <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase">{selectedMessage.subject}</h2>
                  <div className="flex items-center gap-4 text-slate-400 text-sm">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-amber-500" />
                      <span className="font-bold">{selectedMessage.name}</span>
                      {selectedMessage.user && <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded-full text-slate-400">@{selectedMessage.user.username}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-amber-500" />
                      <span>{selectedMessage.email}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Protocolo #{selectedMessage.id}</p>
                  <p className="text-white font-mono text-xs">{new Date(selectedMessage.createdAt).toLocaleString()}</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-6 pr-4 mb-6 scrollbar-thin scrollbar-thumb-slate-800">
                {/* Initial Message */}
                <div className="bg-slate-900/30 p-6 rounded-3xl border border-slate-800/50">
                  <div className="flex items-center gap-2 mb-2 text-[10px] font-black text-slate-500 uppercase">
                    <User className="w-3 h-3" /> Usuário
                  </div>
                  <p className="text-slate-300 whitespace-pre-wrap leading-relaxed">{selectedMessage.message}</p>
                </div>

                {/* Legacy Reply Support */}
                {selectedMessage.reply && (!selectedMessage.replies || selectedMessage.replies.length === 0) && (
                  <div className="bg-amber-500/5 p-6 rounded-3xl border border-amber-500/20 relative ml-8">
                    <div className="absolute -top-3 left-6 bg-amber-500 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase italic">
                      Resposta Legada
                    </div>
                    <p className="text-amber-100/80 whitespace-pre-wrap leading-relaxed">{selectedMessage.reply}</p>
                  </div>
                )}

                {/* Chat Replies */}
                {selectedMessage.replies?.map((r) => (
                  <div 
                    key={r.id} 
                    className={`p-6 rounded-3xl border relative ${
                      r.isAdmin 
                        ? 'bg-amber-500/5 border-amber-500/20 ml-8' 
                        : 'bg-slate-900/30 border-slate-800/50 mr-8'
                    }`}
                  >
                    <div className={`flex items-center gap-2 mb-2 text-[10px] font-black uppercase ${r.isAdmin ? 'text-amber-500' : 'text-slate-500'}`}>
                      {r.isAdmin ? <Settings className="w-3 h-3" /> : <User className="w-3 h-3" />}
                      {r.isAdmin ? 'Equipe Suporte' : 'Usuário'} 
                      <span className="ml-auto font-mono opacity-50">{new Date(r.createdAt).toLocaleString()}</span>
                    </div>
                    <p className={`${r.isAdmin ? 'text-amber-100/80' : 'text-slate-300'} whitespace-pre-wrap leading-relaxed`}>
                      {r.message}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-auto space-y-4 border-t border-slate-800 pt-6">
                {isPasswordResetTicket(selectedMessage.subject) ? (
                  <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Gera um novo token e envia o link de redefinição para o{' '}
                      <span className="text-slate-200 font-bold">e-mail cadastrado na conta</span>. O link expira conforme{' '}
                      <span className="text-slate-300 font-mono text-[10px]">PASSWORD_RESET_TOKEN_TTL</span> no servidor (padrão:{' '}
                      <span className="text-slate-200 font-bold">24 horas</span>). SMTP/Gmail tem de estar configurado.
                    </p>
                    <button
                      type="button"
                      onClick={handleSendResetLink}
                      disabled={sendingResetLink}
                      className="w-full h-11 flex items-center justify-center gap-2 bg-emerald-600/90 hover:bg-emerald-500 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all disabled:opacity-50"
                    >
                      {sendingResetLink ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <KeyRound className="w-4 h-4" />
                          Enviar link de redefinição por e-mail
                        </>
                      )}
                    </button>
                  </div>
                ) : null}
                <textarea
                  placeholder="Escreva sua resposta aqui..."
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl p-4 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors resize-none"
                />
                <button
                  onClick={handleReply}
                  disabled={sendingReply || !reply.trim()}
                  className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black text-xs uppercase tracking-[0.2em] rounded-xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2 italic"
                >
                  {sendingReply ? (
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      ENVIAR RESPOSTA
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center opacity-30">
              <Inbox className="w-20 h-20 mb-4 text-slate-600" />
              <h3 className="text-xl font-bold text-white uppercase tracking-tighter italic">Selecione uma mensagem</h3>
              <p className="text-sm">Clique em uma mensagem da lista ao lado para visualizar os detalhes</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
