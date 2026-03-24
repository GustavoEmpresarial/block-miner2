import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Loader2, ChevronRight, CheckCircle2, AlertCircle, LifeBuoy } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../store/auth';
import { SUPPORT_PASSWORD_RESET_TICKET_MARKER } from '../constants/supportWalletTicket';

const PASSWORD_RESET_TICKET_SUBJECT = `${SUPPORT_PASSWORD_RESET_TICKET_MARKER} Não recebi o link de redefinição`;

function sanitizeResetToken(rawToken) {
  return String(rawToken || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/\s+/g, '');
}

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tokenFromUrl = sanitizeResetToken(searchParams.get('token'));
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [resetToken, setResetToken] = useState(tokenFromUrl);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketName, setTicketName] = useState('');
  const [ticketEmail, setTicketEmail] = useState('');
  const [ticketMessage, setTicketMessage] = useState('');
  const [ticketSending, setTicketSending] = useState(false);
  const [ticketSent, setTicketSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      setIsSubmitting(true);
      const res = await api.post('/auth/forgot-password', { email: email.trim() });
      const token = res.data?.resetToken;

      if (token) {
        setResetToken(token);
        setDone(false);
        toast.success('Conta localizada. Defina sua nova senha agora.');
      } else {
        setDone(true);
        setTicketEmail((prev) => prev || email.trim());
        toast.success('Confira seu e-mail e a caixa de spam. O link de redefinição foi enviado por e-mail.');
      }
    } catch (err) {
      const message = err.response?.data?.message || 'Nao foi possivel processar agora.';
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordHelpTicket = async (e) => {
    e.preventDefault();
    setError('');
    const name = ticketName.trim() || ticketEmail.trim().split('@')[0] || 'Usuário';
    const em = ticketEmail.trim();
    const body =
      ticketMessage.trim() ||
      'Não recebi o e-mail com o link de redefinição de senha. Peço ajuda para concluir a recuperação.';

    if (!em) {
      const message = 'Informe um e-mail ou usuário para contato.';
      setError(message);
      toast.error(message);
      return;
    }

    try {
      setTicketSending(true);
      await api.post('/support', {
        name,
        email: em,
        subject: PASSWORD_RESET_TICKET_SUBJECT,
        message: body
      });
      setTicketSent(true);
      toast.success('Chamado aberto. Nossa equipe vai analisar e enviar o link se a conta for localizada.');
    } catch (err) {
      const message = err.response?.data?.message || 'Não foi possível abrir o chamado agora.';
      setError(message);
      toast.error(message);
    } finally {
      setTicketSending(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      const message = 'A nova senha precisa ter pelo menos 8 caracteres.';
      setError(message);
      toast.error(message);
      return;
    }

    if (newPassword !== confirmPassword) {
      const message = 'As senhas não coincidem.';
      setError(message);
      toast.error(message);
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await api.post('/auth/legacy-password-reset', {
        resetToken: sanitizeResetToken(resetToken),
        newPassword
      });
      toast.success(res.data?.message || 'Senha redefinida com sucesso.');
      navigate('/login');
    } catch (err) {
      const message = err.response?.data?.message || 'Falha ao redefinir senha.';
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px] animate-pulse delay-700"></div>

      <div className="w-full max-w-[440px] relative z-10">
        <div className="text-center mb-10 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="inline-flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-gradient-to-tr from-primary to-blue-600 rounded-2xl flex items-center justify-center shadow-xl shadow-primary/20 overflow-hidden">
              <img src="/icon.png" alt="Logo" className="w-7 h-7 object-contain" />
            </div>
            <span className="font-black text-3xl tracking-tighter text-white">BLOCK<span className="text-primary">MINER</span></span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Recuperar senha</h1>
          <p className="text-gray-500 font-medium mt-1">
            Digite o mesmo e-mail ou nome de usuário que você usa no login.
          </p>
        </div>

        <div className="bg-surface/50 backdrop-blur-xl border border-gray-800/50 rounded-[2.5rem] p-10 shadow-2xl animate-in fade-in zoom-in-95 duration-700 delay-200">
          {error && (
            <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-red-400 text-xs font-bold leading-relaxed">{error}</p>
            </div>
          )}

          {!done && !resetToken ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1" htmlFor="email">
                  E-mail ou usuário
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-gray-600 group-focus-within:text-primary transition-colors" />
                  </div>
                  <input
                    id="email"
                    type="text"
                    name="identifier"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full pl-12 pr-4 py-4 border border-gray-800 rounded-2xl bg-background/50 text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/50 transition-all font-medium text-sm"
                    placeholder="voce@email.com ou seu_usuario"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex justify-center items-center gap-2 py-4 px-6 bg-primary hover:bg-primary-hover text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-primary/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                {isSubmitting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Enviar solicitação
                    <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>
          ) : null}

          {resetToken ? (
            <form onSubmit={handleResetPassword} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1" htmlFor="new-password">
                  Nova senha
                </label>
                <input
                  id="new-password"
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="block w-full px-4 py-4 border border-gray-800 rounded-2xl bg-background/50 text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/50 transition-all font-medium text-sm"
                  placeholder="Mínimo de 8 caracteres"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1" htmlFor="confirm-password">
                  Confirmar nova senha
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="block w-full px-4 py-4 border border-gray-800 rounded-2xl bg-background/50 text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/50 transition-all font-medium text-sm"
                  placeholder="Repita a nova senha"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex justify-center items-center gap-2 py-4 px-6 bg-primary hover:bg-primary-hover text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-primary/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                {isSubmitting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Salvar nova senha
                    <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>
          ) : null}

          {done ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-emerald-300 text-xs font-bold leading-relaxed">
                  Solicitação registrada. Confira seu e-mail e a caixa de spam.
                  O link de redefinição foi enviado por e-mail — ele expira em até <span className="text-emerald-200">24 horas</span>{' '}
                  (o prazo exato vem no corpo do e-mail).
                </p>
              </div>

              {!ticketSent ? (
                <div className="rounded-2xl border border-slate-700/80 bg-slate-900/40 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setTicketOpen((o) => !o)}
                    className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-800/50 transition-colors"
                  >
                    <LifeBuoy className="w-5 h-5 text-primary shrink-0" />
                    <span className="text-sm font-bold text-slate-200">
                      Não recebeu o e-mail? Abrir chamado com o suporte
                    </span>
                    <ChevronRight
                      className={`w-4 h-4 text-slate-500 ml-auto transition-transform ${ticketOpen ? 'rotate-90' : ''}`}
                    />
                  </button>
                  {ticketOpen ? (
                    <form onSubmit={handlePasswordHelpTicket} className="px-5 pb-5 pt-0 space-y-4 border-t border-slate-800/80">
                      <p className="text-[11px] text-slate-500 leading-relaxed pt-4">
                        Se o e-mail automático não chegou, abra um chamado aqui. A equipe pode reenviar o link manualmente para o
                        e-mail da sua conta. Esse link também expira em até <span className="text-slate-400 font-bold">24 horas</span>.
                      </p>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1" htmlFor="ticket-name">
                          Como podemos te chamar
                        </label>
                        <input
                          id="ticket-name"
                          type="text"
                          value={ticketName}
                          onChange={(e) => setTicketName(e.target.value)}
                          className="block w-full px-4 py-3 border border-gray-800 rounded-2xl bg-background/50 text-gray-200 text-sm focus:outline-none focus:border-primary/50"
                          placeholder="Seu nome ou apelido"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1" htmlFor="ticket-email">
                          E-mail ou usuário do cadastro
                        </label>
                        <input
                          id="ticket-email"
                          type="text"
                          required
                          value={ticketEmail}
                          onChange={(e) => setTicketEmail(e.target.value)}
                          className="block w-full px-4 py-3 border border-gray-800 rounded-2xl bg-background/50 text-gray-200 text-sm focus:outline-none focus:border-primary/50"
                          placeholder='Mesmo dado usado em "Recuperar senha"'
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1" htmlFor="ticket-msg">
                          Mensagem (opcional)
                        </label>
                        <textarea
                          id="ticket-msg"
                          rows={3}
                          value={ticketMessage}
                          onChange={(e) => setTicketMessage(e.target.value)}
                          className="block w-full px-4 py-3 border border-gray-800 rounded-2xl bg-background/50 text-gray-200 text-sm focus:outline-none focus:border-primary/50 resize-none"
                          placeholder="Ex.: já verifiquei spam, outro e-mail de vocês chega normalmente…"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={ticketSending}
                        className="w-full flex justify-center items-center gap-2 py-3.5 px-6 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest border border-slate-600 transition-all disabled:opacity-50"
                      >
                        {ticketSending ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Enviar chamado'}
                      </button>
                    </form>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-2xl border border-primary/25 bg-primary/10 p-4 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <p className="text-slate-200 text-xs font-bold leading-relaxed">
                    Chamado registrado. Em breve a equipe pode reenviar o link para o e-mail cadastrado na sua conta (o link
                    enviado vale até <span className="text-primary">24 horas</span>).
                  </p>
                </div>
              )}
            </div>
          ) : null}

          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="text-primary hover:text-white font-black text-xs uppercase tracking-widest transition-colors"
            >
              Voltar para login
            </button>
          </div>
        </div>

        <div className="mt-8 text-center animate-in fade-in duration-1000 delay-500">
          <Link to="/" className="text-gray-600 hover:text-gray-400 text-xs font-bold uppercase tracking-[0.2em] transition-colors">
            Voltar
          </Link>
        </div>
      </div>
    </div>
  );
}