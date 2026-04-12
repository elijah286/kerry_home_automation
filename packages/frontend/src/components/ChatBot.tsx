'use client';

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  memo,
  createContext,
  useContext,
  useMemo,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { MessageSquare, X, Send, Loader2, Bot, User, Maximize2, Minimize2 } from 'lucide-react';
import { clsx } from 'clsx';

const API_BASE =
  typeof window !== 'undefined'
    ? `http://${window.location.hostname}:3000`
    : 'http://localhost:3000';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const markdownComponents = {
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}
    >
      {children}
    </a>
  ),
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-2 last:mb-0 ml-4 list-disc space-y-0.5">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-2 last:mb-0 ml-4 list-decimal space-y-0.5">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => <li className="pl-0.5">{children}</li>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold">{children}</strong>,
  code: ({ children }: { children?: React.ReactNode }) => (
    <code
      className="rounded px-1 py-0.5 text-xs font-mono"
      style={{ backgroundColor: 'var(--color-bg-hover, rgba(0,0,0,0.06))' }}
    >
      {children}
    </code>
  ),
};

const ChatBubble = memo(function ChatBubble({ msg }: { msg: Message }) {
  return (
    <div className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      {msg.role === 'assistant' && (
        <div
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
        >
          <Bot className="h-3 w-3" />
        </div>
      )}
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
          msg.role === 'user' ? 'whitespace-pre-wrap' : 'chat-markdown'
        }`}
        style={{
          backgroundColor: msg.role === 'user' ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
          color: msg.role === 'user' ? '#fff' : 'var(--color-text)',
        }}
      >
        {msg.role === 'user' ? (
          msg.content
        ) : (
          <ReactMarkdown components={markdownComponents as never}>{msg.content}</ReactMarkdown>
        )}
      </div>
      {msg.role === 'user' && (
        <div
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: 'var(--color-bg-hover)' }}
        >
          <User className="h-3 w-3" style={{ color: 'var(--color-text-secondary)' }} />
        </div>
      )}
    </div>
  );
});

interface AssistantContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);

export function useAssistant(): AssistantContextValue {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error('useAssistant must be used within AssistantProvider');
  return ctx;
}

export function AssistantHeaderButton({
  variant = 'default',
  className,
  style,
}: {
  variant?: 'default' | 'lcars';
  className?: string;
  style?: CSSProperties;
}) {
  const { open, toggle } = useAssistant();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={open ? 'Close AI assistant' : 'Open AI assistant'}
      aria-expanded={open}
      className={clsx(
        'flex shrink-0 items-center justify-center shadow-sm',
        variant === 'default' &&
          'h-9 w-9 rounded-full transition-transform hover:scale-105 active:scale-95',
        variant === 'lcars' &&
          'lcars-chrome-item h-full min-h-0 min-w-[min(160px,28vw)] touch-manipulation gap-1.5 rounded-none px-3 shadow-none transition-[filter] hover:brightness-110 active:brightness-95',
        className,
      )}
      style={{
        backgroundColor: 'var(--color-accent)',
        color: '#fff',
        ...(variant === 'lcars'
          ? {
              fontFamily: 'var(--font-antonio), "Helvetica Neue", sans-serif',
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
            }
          : {}),
        ...style,
      }}
    >
      {variant === 'lcars' ? (
        <>
          <MessageSquare className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
          <span>Assistant</span>
        </>
      ) : (
        <MessageSquare className="h-[18px] w-[18px]" strokeWidth={2} />
      )}
    </button>
  );
}

function AssistantRightPanel() {
  const router = useRouter();
  const { open, setOpen } = useAssistant();
  const [fullscreen, setFullscreen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (fullscreen) setFullscreen(false);
      else setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, fullscreen, setOpen]);

  const inputValRef = useRef(input);
  inputValRef.current = input;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const loadingRef = useRef(loading);
  loadingRef.current = loading;

  const sendMessage = useCallback(async () => {
    const text = inputValRef.current.trim();
    if (!text || loadingRef.current) return;

    setInput('');
    setError(null);
    const newMessages: Message[] = [...messagesRef.current, { role: 'user', content: text }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ messages: newMessages }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        setLoading(false);
        return;
      }

      setMessages([...newMessages, { role: 'assistant', content: data.reply }]);

      if (data.navigate) {
        router.push(data.navigate);
      }
    } catch {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, [router]);

  const close = useCallback(() => {
    setOpen(false);
    setFullscreen(false);
  }, [setOpen]);

  return (
    <>
      {/* Backdrop: tap outside to close on narrow screens */}
      <div
        className={clsx(
          'fixed inset-0 z-[48] bg-black/45 transition-opacity duration-200 md:hidden',
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
        aria-hidden={!open}
        onClick={() => setOpen(false)}
      />

      <div
        className={clsx(
          'fixed z-[50] flex flex-col overflow-hidden border-l shadow-2xl transition-transform duration-200 ease-out',
          fullscreen ? 'inset-0 rounded-none border-0' : 'top-0 bottom-0 right-0 w-full max-w-[min(420px,100vw)] rounded-none',
          open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
        )}
        style={{
          backgroundColor: 'var(--color-bg)',
          borderColor: 'var(--color-border)',
        }}
        role="dialog"
        aria-modal={open}
        aria-label="AI assistant"
        aria-hidden={!open}
      >
        <div
          className="flex shrink-0 items-center gap-2 px-4 py-3"
          style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
        >
          <Bot className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-sm font-medium">AI Assistant</span>
          <button
            type="button"
            onClick={() => setFullscreen(!fullscreen)}
            className="rounded-md p-1 transition-colors hover:bg-white/20"
            aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={close}
            className="rounded-md p-1 transition-colors hover:bg-white/20"
            aria-label="Close assistant"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {messages.length === 0 && !loading && (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center">
              <Bot className="mb-2 h-8 w-8" style={{ color: 'var(--color-text-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                Ask me about your devices, or tell me what to do.
              </p>
              <div className="mt-3 space-y-1">
                {['What lights are on?', 'Show me the cameras', 'Help me set up an integration'].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setInput(s)}
                    className="block w-full rounded-md px-3 py-1.5 text-left text-xs transition-colors"
                    style={{
                      backgroundColor: 'var(--color-bg-secondary)',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <ChatBubble key={i} msg={msg} />
          ))}

          {loading && (
            <div className="flex items-start gap-2">
              <div
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
              >
                <Bot className="h-3 w-3" />
              </div>
              <div className="rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
                <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--color-text-muted)' }} />
              </div>
            </div>
          )}

          {error && (
            <div
              className="rounded-lg px-3 py-2 text-xs"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                color: 'var(--color-danger, #ef4444)',
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t p-3" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Ask something..."
              className="flex-1 rounded-md border px-3 py-2 text-sm transition-colors"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
              }}
              disabled={loading}
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(
    () => ({
      open,
      setOpen,
      toggle: () => setOpen((o) => !o),
    }),
    [open],
  );

  return (
    <AssistantContext.Provider value={value}>
      {children}
      <AssistantRightPanel />
    </AssistantContext.Provider>
  );
}
