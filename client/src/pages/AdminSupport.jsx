
import { useState, useEffect, useCallback } from 'react';
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
import {
  SUPPORT_WALLET_RECOVERY_MARKER,
  SUPPORT_PASSWORD_RESET_TICKET_MARKER,
  parseWalletDepositTicketBody
} from '../constants/supportWalletTicket';
import WalletForensicsPanel from '../components/WalletForensicsPanel';

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
  const [walletForensics, setWalletForensics] = useState(null);
  const [walletForensicsLoading, setWalletForensicsLoading] = useState(false);
  const [passwordRecoveryCtx, setPasswordRecoveryCtx] = useState(null);
  const [passwordRecoveryLoading, setPasswordRecoveryLoading] = useState(false);

  const isPasswordResetTicket = (subject) =>
    String(subject || '').includes(SUPPORT_PASSWORD_RESET_TICKET_MARKER);

  const isWalletRecoveryTicket = (subject) =>
    String(subject || '').includes(SUPPORT_WALLET_RECOVERY_MARKER);

  const walletTicketParsed =
    selectedMessage && isWalletRecoveryTicket(selectedMessage.subject)
      ? parseWalletDepositTicketBody(selectedMessage.message)
      : null;

  useEffect(() => {
    fetchMessages();
  }, []);

  const refreshWalletForensics = useCallback(async () => {
    const id = selectedMessage?.id;
    const subj = selectedMessage?.subject;
    if (!id || !isWalletRecoveryTicket(subj)) return;
    setWalletForensicsLoading(true);
    try {
      const res = await api.get(`/admin/support/${id}/wallet-forensics`, { params: { days: 365 } });
      if (res.data?.ok) setWalletForensics(res.data.forensics);
      else setWalletForensics(null);
    } catch (e) {
      setWalletForensics(null);
      toast.error(e.response?.data?.message || 'Falha ao carregar análise de carteira.');
    } finally {
      setWalletForensicsLoading(false);
    }
  }, [selectedMessage?.id, selectedMessage?.subject]);

  useEffect(() => {
    if (!selectedMessage?.id || !isWalletRecoveryTicket(selectedMessage.subject)) {
      setWalletForensics(null);
      setWalletForensicsLoading(false);
      return;
    }
    refreshWalletForensics();
  }, [selectedMessage?.id, selectedMessage?.subject, refreshWalletForensics]);

  const refreshPasswordRecoveryContext = useCallback(async () => {
    const id = selectedMessage?.id;
    const subj = selectedMessage?.subject;
    if (!id || !isPasswordResetTicket(subj)) return;
    setPasswordRecoveryLoading(true);
    try {
      const res = await api.get(`/admin/support/${id}/password-recovery-context`);
      if (res.data?.ok) setPasswordRecoveryCtx(res.data.context);
      else setPasswordRecoveryCtx(null);
    } catch (e) {
      setPasswordRecoveryCtx(null);
      toast.error(e.response?.data?.message || 'Falha ao carregar histórico de recuperação.');
    } finally {
      setPasswordRecoveryLoading(false);
    }
  }, [selectedMessage?.id, selectedMessage?.subject]);

  useEffect(() => {
    if (!selectedMessage?.id || !isPasswordResetTicket(selectedMessage.subject)) {
      setPasswordRecoveryCtx(null);
      setPasswordRecoveryLoading(false);
      return;
    }
    setPasswordRecoveryCtx(null);
    refreshPasswordRecoveryContext();
  }, [selectedMessage?.id, selectedMessage?.subject, refreshPasswordRecoveryContext]);

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
        await refreshPasswordRecoveryContext();
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:items-start">
        {/* Sidebar: lista com scroll próprio; painel direito usa o scroll do main */}
        <div className="lg:col-span-4 flex flex-col gap-4 min-h-0 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-5.5rem)] lg:self-start">
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

          <div className="flex-1 min-h-0 max-h-[50vh] lg:max-h-none overflow-y-auto space-y-2 pr-2 pb-2 scrollbar-thin scrollbar-thumb-slate-800 overscroll-y-contain touch-pan-y">
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
        <div className="lg:col-span-8 bg-slate-950/50 border border-slate-800 rounded-3xl flex flex-col min-w-0">
          {loadingDetails ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
            </div>
          ) : selectedMessage ? (
            <div className="flex flex-col p-6 sm:p-8 min-w-0">
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

              <div className="space-y-6 pb-4">
                {isWalletRecoveryTicket(selectedMessage.subject) ? (
                  <WalletForensicsPanel
                    loading={walletForensicsLoading}
                    data={walletForensics}
                    onRefresh={refreshWalletForensics}
                  />
                ) : null}

                {/* Initial Message */}
                {isWalletRecoveryTicket(selectedMessage.subject) ? (
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] pt-2 border-t border-zinc-800">
                    Texto enviado no chamado
                  </p>
                ) : null}
                {walletTicketParsed ? (
                  <div className="space-y-4">
                    <p className="text-xs font-black text-cyan-400 uppercase tracking-wide">
                      Formulário de depósito (cópia legível)
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="bg-zinc-900 p-4 rounded-2xl border border-emerald-500/50 min-h-0 max-h-72 overflow-y-auto">
                        <p className="text-[10px] font-black text-emerald-400 uppercase mb-2 tracking-wider">Carteiras informadas</p>
                        <pre className="text-sm text-white font-mono whitespace-pre-wrap break-all leading-relaxed">
                          {walletTicketParsed.wallets || '—'}
                        </pre>
                      </div>
                      <div className="bg-zinc-900 p-4 rounded-2xl border border-amber-500/50 min-h-0 max-h-72 overflow-y-auto">
                        <p className="text-[10px] font-black text-amber-300 uppercase mb-2 tracking-wider">TxHashes</p>
                        <pre className="text-sm text-white font-mono whitespace-pre-wrap break-all leading-relaxed">
                          {walletTicketParsed.hashes && walletTicketParsed.hashes !== '(nenhum informado)'
                            ? walletTicketParsed.hashes
                            : '—'}
                        </pre>
                      </div>
                    </div>
                    <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-600 min-h-0 max-h-56 overflow-y-auto">
                      <p className="text-[10px] font-black text-zinc-400 uppercase mb-2 tracking-wider">Dados automáticos da conta</p>
                      <pre className="text-sm text-zinc-100 font-mono whitespace-pre-wrap break-all leading-relaxed">
                        {walletTicketParsed.auto || '—'}
                      </pre>
                    </div>
                    {walletTicketParsed.notes && walletTicketParsed.notes !== '(nenhuma)' ? (
                      <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-600">
                        <p className="text-[10px] font-black text-zinc-400 uppercase mb-2 tracking-wider">Observações extras</p>
                        <p className="text-sm text-zinc-100 whitespace-pre-wrap leading-relaxed">{walletTicketParsed.notes}</p>
                      </div>
                    ) : null}
                    <details className="text-xs text-zinc-400">
                      <summary className="cursor-pointer font-bold text-zinc-300 hover:text-white py-2">
                        Ver mensagem bruta (completa)
                      </summary>
                      <pre className="mt-2 p-4 rounded-xl bg-black border border-zinc-700 text-zinc-200 font-mono whitespace-pre-wrap break-all text-xs max-h-64 overflow-y-auto">
                        {selectedMessage.message}
                      </pre>
                    </details>
                  </div>
                ) : (
                  <div className="bg-zinc-900 p-6 rounded-3xl border border-zinc-600">
                    <div className="flex items-center gap-2 mb-3 text-[10px] font-black text-zinc-300 uppercase tracking-widest">
                      <User className="w-3 h-3 text-amber-500" /> Mensagem do utilizador
                    </div>
                    <p className="text-sm text-zinc-50 whitespace-pre-wrap leading-relaxed break-words">{selectedMessage.message}</p>
                  </div>
                )}

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

              <div className="space-y-4 border-t border-slate-800 pt-6 mt-8 shrink-0">
                {isPasswordResetTicket(selectedMessage.subject) ? (
                  <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-4">
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400/90">
                        Histórico de recuperação
                      </p>
                      {passwordRecoveryLoading ? (
                        <div className="flex items-center gap-2 text-slate-500 text-xs">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          A carregar…
                        </div>
                      ) : passwordRecoveryCtx ? (
                        <ul className="text-[11px] text-slate-400 leading-relaxed space-y-1.5 list-none pl-0">
                          <li>
                            <span className="text-slate-200 font-bold">
                              {passwordRecoveryCtx.senhaTicketTotal}
                            </span>{' '}
                            chamado(s) com {SUPPORT_PASSWORD_RESET_TICKET_MARKER} para este e-mail ou conta
                            {passwordRecoveryCtx.hadPriorSenhaTickets ? (
                              <span className="text-amber-400 font-bold"> — já pediu recuperação antes</span>
                            ) : (
                              <span className="text-slate-500"> — primeiro chamado deste tipo (neste critério)</span>
                            )}
                            .
                          </li>
                          <li>
                            Link(s) de redefinição enviado(s) pela equipe (respostas do painel):{' '}
                            <span className="text-slate-200 font-bold">
                              {passwordRecoveryCtx.adminResetLinkSendsCount}
                            </span>
                            .
                          </li>
                          {passwordRecoveryCtx.linkedUser ? (
                            <li>
                              Conta associada:{' '}
                              <span className="text-slate-200 font-mono text-[10px]">
                                {passwordRecoveryCtx.linkedUser.email}
                              </span>{' '}
                              (id {passwordRecoveryCtx.linkedUser.id})
                            </li>
                          ) : (
                            <li className="text-amber-400/90">
                              Nenhuma conta encontrada pelos dados deste ticket — confira o e-mail no formulário.
                            </li>
                          )}
                          {passwordRecoveryCtx.accountCreatedBySupportTicket ? (
                            <li className="text-cyan-400/90">
                              Conta criada automaticamente ao abrir chamado [Senha] (e-mail não existia).{' '}
                              {passwordRecoveryCtx.supportAutoProvisionAt
                                ? `Registo: ${new Date(passwordRecoveryCtx.supportAutoProvisionAt).toLocaleString()}.`
                                : null}
                            </li>
                          ) : null}
                          {!passwordRecoveryCtx.smtpConfigured ? (
                            <li className="text-red-400/90 font-bold">
                              SMTP não configurado no servidor — o botão abaixo não conseguirá enviar e-mail.
                            </li>
                          ) : null}
                          <li className="text-slate-500 text-[10px] pt-1">
                            Tentativas pela página “Esqueci a senha” não aparecem aqui; só chamados de suporte e envios pelo
                            painel.
                          </li>
                        </ul>
                      ) : (
                        <p className="text-xs text-slate-500">Sem dados de histórico.</p>
                      )}
                    </div>
                    {passwordRecoveryCtx?.senhaTickets?.length ? (
                      <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-3 max-h-36 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
                        <p className="text-[9px] font-black uppercase text-slate-500 mb-2 tracking-wider">
                          Chamados [Senha] (mais recentes primeiro)
                        </p>
                        <ul className="space-y-1.5 text-[10px] text-slate-400 font-mono">
                          {passwordRecoveryCtx.senhaTickets.slice(0, 12).map((t) => (
                            <li
                              key={t.id}
                              className={`flex flex-wrap gap-x-2 gap-y-0.5 ${t.isCurrent ? 'text-emerald-300' : ''}`}
                            >
                              <span>#{t.id}</span>
                              <span>{new Date(t.createdAt).toLocaleString()}</span>
                              {t.isCurrent ? (
                                <span className="text-emerald-500 font-bold uppercase">este</span>
                              ) : null}
                              {t.isReplied ? (
                                <span className="text-slate-500">respondido</span>
                              ) : (
                                <span className="text-amber-600/90">pendente</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      <span className="text-slate-200 font-bold">Liberar recuperação</span> gera um novo token e envia o link
                      para o e-mail cadastrado na conta. O link expira conforme{' '}
                      <span className="text-slate-300 font-mono text-[10px]">PASSWORD_RESET_TOKEN_TTL</span> (padrão: 24 horas).
                    </p>
                    <button
                      type="button"
                      onClick={handleSendResetLink}
                      disabled={
                        sendingResetLink ||
                        passwordRecoveryLoading ||
                        (passwordRecoveryCtx && !passwordRecoveryCtx.smtpConfigured) ||
                        (passwordRecoveryCtx && !passwordRecoveryCtx.linkedUser)
                      }
                      className="w-full h-11 flex items-center justify-center gap-2 bg-emerald-600/90 hover:bg-emerald-500 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all disabled:opacity-50"
                    >
                      {sendingResetLink ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <KeyRound className="w-4 h-4" />
                          Liberar recuperação — enviar link por e-mail
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
            <div className="flex flex-col items-center justify-center p-12 text-center opacity-30 min-h-[40vh]">
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
