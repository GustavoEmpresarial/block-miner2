import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Send, Smile, ShieldCheck, X } from 'lucide-react';
import { useGameStore } from '../store/game';
import { useAuthStore } from '../store/auth';

const QUICK_EMOJIS = ["😀", "😂", "🤣", "😍", "😎", "🤝", "🔥", "🚀", "💎", "⛏️", "🎉", "✅", "💬", "👏"];

function renderMessageText(text, currentUsername) {
    if (!text) return null;

    // Regex to find @username
    const mentionRegex = /@(\w+)/g;
    const parts = text.split(mentionRegex);

    // The split returns: [textBefore, match1Group, textBetween, match2Group, ...]
    // So even indices are normal text, odd indices are the matched username (without the @)

    return parts.map((part, index) => {
        if (index % 2 === 1) { // This is a mention
            const isMe = part === currentUsername;
            return (
                <span
                    key={index}
                    className={`font-black ${isMe ? 'bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-md' : 'text-primary'}`}
                >
                    @{part}
                </span>
            );
        }
        return <span key={index}>{part}</span>;
    });
}

export default function ChatSidebar() {
    const { t } = useTranslation();
    const { user } = useAuthStore();
    const { messages, sendMessage, initSocket, fetchMessages, isChatOpen, closeChat } = useGameStore();
    const [newMessage, setNewMessage] = useState('');
    const [showEmojis, setShowEmojis] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, []);

    useEffect(() => {
        if (isChatOpen) {
            initSocket();
            fetchMessages();
            scrollToBottom();
        }
    }, [isChatOpen, initSocket, fetchMessages, scrollToBottom]);

    useEffect(() => {
        if (isChatOpen) {
            scrollToBottom();
        }
    }, [messages, isChatOpen, scrollToBottom]);

    const handleSend = async (e) => {
        e.preventDefault();
        const msg = newMessage.trim();
        if (!msg) return;

        setNewMessage('');
        const res = await sendMessage(msg);
        if (!res.ok) {
            toast.error(res.message || 'Erro ao enviar mensagem.');
        }
    };

    const addEmoji = (emoji) => {
        setNewMessage(prev => prev + emoji);
        setShowEmojis(false);
    };

    // If chat is closed, we don't render the visible panel, but keep the shell for transitions
    return (
        <div
            className={`fixed inset-y-0 right-0 z-50 w-full md:w-[400px] bg-slate-950/95 backdrop-blur-xl border-l border-gray-800/80 shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out ${isChatOpen ? 'translate-x-0' : 'translate-x-full'}`}
        >
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-800/50 bg-slate-900/50">
                <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] animate-pulse" />
                    <div>
                        <h2 className="text-lg font-black text-white tracking-tight">Comunidade</h2>
                        <div className="flex items-center gap-1.5">
                            <ShieldCheck className="w-3 h-3 text-emerald-400" />
                            <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Criptografia Ativa</span>
                        </div>
                    </div>
                </div>
                <button
                    onClick={closeChat}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-xl transition-all"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide bg-gradient-to-b from-transparent to-slate-900/20">
                {messages.map((msg, i) => {
                    const isOwn = msg.userId === user?.id;
                    const initial = (msg.username || 'M').charAt(0).toUpperCase();

                    return (
                        <div key={i} className={`flex items-end gap-3 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs border shadow-lg ${isOwn ? 'bg-primary border-primary/20 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'
                                }`}>
                                {initial}
                            </div>
                            <div className={`max-w-[75%] space-y-1 ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                                <div className="flex items-center gap-2 px-1">
                                    <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{msg.username}</span>
                                    <span className="text-[8px] text-gray-600">{new Date(msg.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                <div className={`px-4 py-3 rounded-2xl text-[13px] font-medium shadow-sm leading-relaxed whitespace-pre-wrap break-words ${isOwn
                                        ? 'bg-primary text-white rounded-br-none'
                                        : 'bg-gray-800/60 text-gray-200 border border-gray-800/50 rounded-bl-none'
                                    }`}>
                                    {renderMessageText(msg.message, user?.name)}
                                </div>
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-4 bg-slate-900/80 border-t border-gray-800/50">
                <form onSubmit={handleSend} className="relative flex flex-col gap-2">
                    <div className="relative flex items-center bg-gray-900 border border-gray-700/50 rounded-2xl shadow-inner focus-within:border-primary/50 transition-colors">
                        <input
                            type="text"
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            placeholder="Digite sua mensagem ou @usuario..."
                            className="w-full bg-transparent py-3.5 pl-4 pr-10 text-gray-200 text-sm focus:outline-none"
                            autoComplete="off"
                        />
                        <button
                            type="button"
                            onClick={() => setShowEmojis(!showEmojis)}
                            className="absolute right-3 text-gray-500 hover:text-amber-400 transition-colors p-1"
                        >
                            <Smile className="w-5 h-5" />
                        </button>
                    </div>

                    {showEmojis && (
                        <div className="absolute bottom-full right-0 mb-3 bg-gray-800 border border-gray-700 rounded-2xl p-3 shadow-2xl grid grid-cols-7 gap-1.5 animate-in slide-in-from-bottom-2 duration-200 z-50">
                            {QUICK_EMOJIS.map(emoji => (
                                <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => addEmoji(emoji)}
                                    className="text-lg hover:bg-gray-700 rounded-lg p-1 transition-colors"
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={!newMessage.trim()}
                        className="bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:hover:bg-primary text-white py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-primary/20 transition-all active:scale-[0.98] font-bold text-sm"
                    >
                        <Send className="w-4 h-4" />
                        Enviar
                    </button>
                </form>
            </div>
        </div>
    );
}
