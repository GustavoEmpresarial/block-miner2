import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, X, MessageSquare, ShieldCheck, RefreshCw, RotateCcw, Search, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore, api } from '../store/auth';
import { useGameStore } from '../store/game';

const STORAGE_TICKET_ID = 'bm_support_mini_chat_ticketId';
const STORAGE_IS_OPEN = 'bm_support_mini_chat_isOpen';

const SUPPORT_CHAT_SUBJECT = 'Suporte (chat)';
const MAX_PRINT_BYTES = 180 * 1024; // limita o tamanho do "print" (base64) para não estourar o backend

function normalizeId(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function SupportMiniChat() {
  const { user, isAuthenticated } = useAuthStore();
  const { isChatOpen } = useGameStore();

  const [isOpen, setIsOpen] = useState(false);
  const [ticketId, setTicketId] = useState(null);
  const [subject, setSubject] = useState(SUPPORT_CHAT_SUBJECT);
  const [draft, setDraft] = useState('');
  const [publicName, setPublicName] = useState('');
  const [publicEmail, setPublicEmail] = useState('');

  const [ticket, setTicket] = useState(null); // { id, subject, message, replies, createdAt }
  const [loadingTicket, setLoadingTicket] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorText, setErrorText] = useState('');

  // Ticket list / search (requires login)
  const [tickets, setTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [ticketQuery, setTicketQuery] = useState('');
  const [showTicketsList, setShowTicketsList] = useState(false);

  // Composer extras
  const [linkDraft, setLinkDraft] = useState('');
  const [attachmentDataUrl, setAttachmentDataUrl] = useState('');
  const [attachmentError, setAttachmentError] = useState('');

  const scrollerRef = useRef(null);

  const canRead = useMemo(() => isAuthenticated && !!user, [isAuthenticated, user]);
  const canReply = canRead;

  useEffect(() => {
    try {
      const storedId = normalizeId(localStorage.getItem(STORAGE_TICKET_ID));
      if (storedId) setTicketId(storedId);
      const storedOpen = localStorage.getItem(STORAGE_IS_OPEN);
      if (storedOpen !== null) setIsOpen(storedOpen === '1');
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_IS_OPEN, isOpen ? '1' : '0');
    } catch {
      // ignore
    }
  }, [isOpen]);

  useEffect(() => {
    if (!ticketId) return;
    fetchTicket(ticketId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId, canRead, publicEmail]);

  useEffect(() => {
    if (!canRead) return;
    if (!isOpen) return;
    if (!ticketId) return;

    // Poll pra atualizar replies vindas do suporte.
    const t = setInterval(() => {
      fetchTicket(ticketId);
    }, 15000);

    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, ticketId, canRead]);

  const fetchTickets = async () => {
    if (!canRead) {
      const email = publicEmail.trim();
      if (!email) return;
    }
    setLoadingTickets(true);
    setErrorText('');
    try {
      const res = canRead
        ? await api.get('/support')
        : await api.get(`/support/public/by-email?email=${encodeURIComponent(publicEmail.trim())}`);

      if (res.data?.ok) setTickets(Array.isArray(res.data.messages) ? res.data.messages : []);
      else throw new Error(res.data?.message || 'Erro ao carregar chamados');
    } catch (err) {
      const m = err?.response?.data?.message || err?.message || 'Falha ao carregar chamados';
      setErrorText(m);
    } finally {
      setLoadingTickets(false);
    }
  };

  useEffect(() => {
    if (!showTicketsList) return;
    fetchTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTicketsList, canRead, publicEmail]);

  const composeSupportMessage = () => {
    const base = draft.trim();
    const link = linkDraft.trim();
    const print = attachmentDataUrl;

    if (!base && !link && !print) return '';

    let composed = base;

    if (link) {
      composed = composed ? `${composed}\n\nLink: ${link}` : `Link: ${link}`;
    }

    if (print) {
      composed = composed ? `${composed}\n\n[PRINT]${print}` : `[PRINT]${print}`;
    }

    return composed;
  };

  const renderMessageWithArtifacts = (text) => {
    if (!text) return null;
    const idx = text.indexOf('[PRINT]');
    if (idx !== -1) {
      const before = text.slice(0, idx).trim();
      return (
        <div className="space-y-2">
          {before ? <p className="whitespace-pre-wrap break-words">{before}</p> : null}
          <div className="text-[11px] font-black text-emerald-300 uppercase tracking-widest">Print anexado</div>
        </div>
      );
    }
    return <p className="whitespace-pre-wrap break-words">{text}</p>;
  };

  const handlePrintFileChange = (file) => {
    setAttachmentError('');
    if (!file) return;
    if (file.size > MAX_PRINT_BYTES) {
      setAttachmentError('Print muito grande. Use uma imagem menor (ou envie só o link).');
      toast.error('Print muito grande. Use uma imagem menor.');
      return;
    }
    if (!file.type?.startsWith('image/')) {
      setAttachmentError('O print precisa ser uma imagem (png/jpg/webp...).');
      toast.error('Formato inválido. Envie uma imagem.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      setAttachmentDataUrl(result);
    };
    reader.onerror = () => {
      setAttachmentError('Falha ao ler o arquivo do print.');
      toast.error('Falha ao ler o print.');
    };
    reader.readAsDataURL(file);
  };

  const fetchTicket = async (id) => {
    if (!id) return;
    setLoadingTicket(true);
    setErrorText('');
    try {
      if (!canRead && !publicEmail.trim()) {
        setTicket(null);
        setErrorText('Informe seu e-mail para abrir a conversa.');
        return;
      }
      const res = canRead
        ? await api.get(`/support/${id}`)
        : await api.get(`/support/public/${id}?email=${encodeURIComponent(publicEmail.trim())}`);
      if (res.data?.ok) {
        const msg = res.data.message;
        setTicket(msg);
        setSubject(msg?.subject || SUPPORT_CHAT_SUBJECT);

        // Mantém scroll no fim quando novas mensagens chegarem.
        setTimeout(() => {
          scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' });
        }, 0);
      } else {
        throw new Error(res.data?.message || 'Erro ao carregar ticket');
      }
    } catch (err) {
      try {
        if (err?.response?.status === 401) return;
      } catch {
        // ignore
      }
      setTicket(null);
      // Se não deu pra carregar, mostra erro (mas não quebra a UI).
      setErrorText(err?.response?.data?.message || err?.message || 'Falha ao carregar conversa.');
    } finally {
      setLoadingTicket(false);
    }
  };

  const createTicket = async () => {
    const name = canReply ? (user?.name || user?.username || 'Usuário') : publicName.trim();
    const email = canReply ? user?.email : publicEmail.trim();

    const msg = composeSupportMessage();
    if (!msg) return;
    setErrorText('');
    if (!name) {
      toast.error('Informe seu nome para abrir o chamado.');
      return;
    }
    if (!email) {
      toast.error('Informe seu e-mail para contato.');
      return;
    }

    setSending(true);
    try {
      const res = await api.post('/support', {
        name,
        email,
        subject,
        message: msg,
      });

      if (!res.data?.ok) throw new Error(res.data?.message || 'Erro ao criar chamado');

      const newId = normalizeId(res.data.id);
      if (!newId) throw new Error('ID do ticket inválido');

      setTicketId(newId);
      setTicket(null);
      setDraft('');
      setLinkDraft('');
      setAttachmentDataUrl('');
      setAttachmentError('');

      try {
        localStorage.setItem(STORAGE_TICKET_ID, String(newId));
      } catch {
        // ignore
      }

      if (canRead) {
        await fetchTicket(newId);
      } else {
        // Antes do login, ainda conseguimos abrir a conversa pelo e-mail
        await fetchTicket(newId);
      }
      toast.success('Chamado aberto no suporte.');
    } catch (err) {
      const m = err?.response?.data?.message || err?.message || 'Falha ao abrir chamado';
      setErrorText(m);
      toast.error(m);
    } finally {
      setSending(false);
    }
  };

  const sendReply = async () => {
    const email = publicEmail.trim();
    if (!canReply && !email) {
      toast.error('Informe seu e-mail para responder o suporte (antes do login).');
      return;
    }
    if (!ticketId) return;

    const msg = composeSupportMessage();
    if (!msg) return;

    setSending(true);
    setErrorText('');
    try {
      const res = canReply
        ? await api.post(`/support/${ticketId}/reply`, { message: msg })
        : await api.post(`/support/public/${ticketId}/reply`, { message: msg, email });
      if (!res.data?.ok) throw new Error(res.data?.message || 'Erro ao enviar');

      setDraft('');
      setLinkDraft('');
      setAttachmentDataUrl('');
      setAttachmentError('');
      await fetchTicket(ticketId);
    } catch (err) {
      const m = err?.response?.data?.message || err?.message || 'Falha ao enviar resposta';
      setErrorText(m);
      toast.error(m);
    } finally {
      setSending(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (sending) return;
    if (!ticketId) return createTicket();
    return sendReply();
  };

  const resetConversation = () => {
    setTicketId(null);
    setTicket(null);
    setDraft('');
    setPublicName('');
    setPublicEmail('');
    setLinkDraft('');
    setAttachmentDataUrl('');
    setAttachmentError('');
    try {
      localStorage.removeItem(STORAGE_TICKET_ID);
    } catch {
      // ignore
    }
  };

  const renderConversation = () => {
    if (!ticket) return null;

    const replies = Array.isArray(ticket?.replies) ? ticket.replies : [];

    return (
      <div className="flex-1 overflow-y-auto p-3 space-y-3" ref={scrollerRef} style={{ maxHeight: '55vh' }}>
        <div className="flex flex-col gap-2">
          <div className="self-end max-w-[90%] bg-primary/15 border border-primary/25 rounded-2xl px-3 py-2">
            <p className="text-[11px] font-black text-primary uppercase tracking-widest">Você</p>
            <div className="text-[13px] text-white/90 mt-1">{renderMessageWithArtifacts(ticket.message)}</div>
          </div>
        </div>

        {replies.map((r) => (
          <div key={r.id} className={`flex ${r.isAdmin ? 'justify-start' : 'justify-end'}`}>
            <div
              className={`max-w-[90%] rounded-2xl px-3 py-2 border ${
                r.isAdmin
                  ? 'bg-emerald-500/10 border-emerald-500/20'
                  : 'bg-primary/15 border-primary/25'
              }`}
            >
              <p className={`text-[11px] font-black uppercase tracking-widest ${r.isAdmin ? 'text-emerald-300' : 'text-primary'}`}>
                {r.isAdmin ? 'Equipe Block Miner' : 'Você'}
              </p>
              <div className="text-[13px] text-white/90 mt-1">{renderMessageWithArtifacts(r.message)}</div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderTicketsList = () => {
    const q = ticketQuery.trim().toLowerCase();

    const filtered = tickets.filter((t) => {
      if (!q) return true;
      const email = String(t.email || '').toLowerCase();
      const subj = String(t.subject || '').toLowerCase();
      const msg = String(t.message || '').toLowerCase();
      return email.includes(q) || subj.includes(q) || msg.includes(q);
    });

    return (
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center text-primary">
            <Search className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <input
              value={ticketQuery}
              onChange={(e) => setTicketQuery(e.target.value)}
              placeholder="Buscar por email ou assunto..."
              className="w-full bg-gray-900/40 border border-gray-800/60 rounded-2xl py-3 px-4 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
        </div>

        {loadingTickets ? (
          <div className="flex justify-center py-8">
            <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-gray-800/60 bg-gray-900/30 p-4 text-center">
            <p className="text-[12px] font-black text-white">Nenhum chamado encontrado</p>
            <p className="text-[11px] text-gray-400 mt-1">Tente outro e-mail ou assunto.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  const newId = normalizeId(t.id);
                  if (!newId) return;
                  setTicketId(newId);
                  setTicket(null);
                  setSubject(t.subject || SUPPORT_CHAT_SUBJECT);
                  setShowTicketsList(false);
                  setErrorText('');
                }}
                className="w-full text-left rounded-2xl border border-gray-800/60 bg-gray-900/30 p-4 hover:bg-gray-900/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[12px] font-black text-white truncate">{t.subject || 'Sem assunto'}</p>
                  {t.isReplied ? (
                    <span className="text-[10px] font-black text-emerald-300 uppercase tracking-widest">Respondido</span>
                  ) : (
                    <span className="text-[10px] font-black text-amber-300 uppercase tracking-widest">Aguardando</span>
                  )}
                </div>
                <p className="text-[11px] text-gray-400 mt-2 truncate">{t.email}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Evita sobrepor o chat social gigante quando estiver aberto.
  if (isChatOpen) return null;

  // Sem botão flutuante: só renderiza o painel quando estiver "aberto".
  if (!isOpen) return null;

  return (
    <div className="fixed right-4 bottom-40 z-[99999]">
      <div className="w-[360px] max-w-[calc(100vw-2rem)] bg-slate-950/95 backdrop-blur-xl border border-gray-800/80 shadow-2xl rounded-[1.2rem] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60 bg-slate-900/40">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center text-primary">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-black text-white uppercase tracking-widest truncate">Suporte</p>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest truncate">{subject}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (!canRead && !publicEmail.trim()) {
                  toast.error('Informe seu e-mail para buscar os chamados.');
                  return;
                }
                setShowTicketsList((v) => {
                  const next = !v;
                  if (next) fetchTickets();
                  return next;
                });
              }}
              className="w-7 h-7 rounded-xl bg-gray-800/40 hover:bg-gray-800/60 text-gray-300 flex items-center justify-center transition-colors border border-gray-700/50"
              aria-label="Buscar chamados"
            >
              <MessageSquare className="w-4 h-4" />
            </button>

            {loadingTicket ? (
              <div className="w-7 h-7 rounded-xl bg-gray-800/40 flex items-center justify-center">
                <RefreshCw className="w-4 h-4 animate-spin text-gray-300" />
              </div>
            ) : (
              ticketId && (
                <button
                  type="button"
                  onClick={() => fetchTicket(ticketId)}
                  className="w-7 h-7 rounded-xl bg-gray-800/40 hover:bg-gray-800/60 text-gray-300 flex items-center justify-center transition-colors border border-gray-700/50"
                  aria-label="Atualizar"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )
            )}

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="w-9 h-9 rounded-xl bg-gray-800/40 hover:bg-gray-800/60 text-gray-300 flex items-center justify-center transition-colors border border-gray-700/50"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {errorText ? (
          <div className="mx-3 mt-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-2">
            <p className="text-[11px] font-black text-red-300 leading-relaxed whitespace-pre-wrap break-words">
              {errorText}
            </p>
          </div>
        ) : null}

        {showTicketsList ? (
          renderTicketsList()
        ) : ticket ? (
          renderConversation()
        ) : (
          <div className="p-4">
            {!canRead && (
              <div className="space-y-2 mb-4">
                <input
                  value={publicName}
                  onChange={(e) => setPublicName(e.target.value)}
                  placeholder="Seu nome"
                  className="w-full bg-gray-900/40 border border-gray-800/60 rounded-2xl py-3 px-4 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
                />
                <input
                  value={publicEmail}
                  onChange={(e) => setPublicEmail(e.target.value)}
                  placeholder="Seu e-mail"
                  className="w-full bg-gray-900/40 border border-gray-800/60 rounded-2xl py-3 px-4 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>
            )}

            <div className="rounded-2xl border border-gray-800/60 bg-gray-900/30 p-4">
              <p className="text-[12px] font-black text-white">Abra um chamado</p>
              <p className="text-[11px] text-gray-400 mt-1">
                Envie sua mensagem. A equipe responde por aqui.
              </p>
              {ticketId && !canRead && (
                <p className="text-[11px] text-yellow-300/90 font-bold mt-2">
                  Chamado criado. Agora é só acompanhar e responder pelo e-mail.
                </p>
              )}
            </div>
            <div className="h-3" />
          </div>
        )}

        {!showTicketsList && (
          <form onSubmit={handleSend} className="border-t border-gray-800/60 p-3 bg-slate-900/20">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Escreva sua mensagem para o suporte..."
                  className="w-full min-h-[42px] max-h-[120px] resize-none bg-gray-900/40 border border-gray-800/60 rounded-2xl p-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={sending || !composeSupportMessage()}
                className="h-[42px] w-[42px] rounded-2xl bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:hover:bg-primary flex items-center justify-center text-white border border-white/10 transition-colors"
                aria-label="Enviar"
              >
                {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>

            <div className="mt-2 flex flex-col gap-2">
              <input
                value={linkDraft}
                onChange={(e) => setLinkDraft(e.target.value)}
                placeholder="Link (opcional) - ex: print/discord/ticket..."
                className="w-full bg-gray-900/40 border border-gray-800/60 rounded-2xl py-3 px-4 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
              />

              <div className="flex items-center gap-2">
                <label
                  className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-gray-900/40 border border-gray-800/60 text-gray-200 text-sm cursor-pointer hover:bg-gray-900/50 transition-colors"
                >
                  <Paperclip className="w-4 h-4 text-primary" />
                  <span className="font-black uppercase tracking-widest text-[10px]">Print</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handlePrintFileChange(e.target.files?.[0])}
                  />
                </label>

                {attachmentDataUrl ? (
                  <button
                    type="button"
                    onClick={() => {
                      setAttachmentDataUrl('');
                      setAttachmentError('');
                    }}
                    className="text-[10px] text-gray-400 hover:text-gray-200 font-black uppercase tracking-widest"
                    aria-label="Remover print"
                  >
                    Remover
                  </button>
                ) : null}
              </div>

              {attachmentError ? (
                <p className="text-[10px] text-red-300 font-bold uppercase tracking-widest">
                  {attachmentError}
                </p>
              ) : null}
            </div>

            {ticketId && (
              <div className="mt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={resetConversation}
                  className="text-[10px] text-gray-400 hover:text-gray-200 font-black uppercase tracking-widest"
                >
                  Novo chamado
                </button>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest truncate">
                  {ticket?.id ? `#${ticket.id}` : ''}
                </p>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

