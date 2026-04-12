'use client';

import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { MessageSquare, X, Send, Loader2, Bot, User, Maximize2, Minimize2 } from 'lucide-react';

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3000`
  : 'http://localhost:3000';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const markdownComponents = {
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer"
      style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}>{children}</a>
  ),
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="mb-2 last:mb-0 ml-4 list-disc space-y-0.5">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="mb-2 last:mb-0 ml-4 list-decimal space-y-0.5">{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li className="pl-0.5">{children}</li>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold">{children}</strong>,
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded px-1 py-0.5 text-xs font-mono"
      style={{ backgroundColor: 'var(--color-bg-hover, rgba(0,0,0,0.06))' }}>{children}</code>
  ),
};

const ChatBubble = memo(function ChatBubble({ msg }: { msg: Message }) {
  return (
    <div className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      {msg.role === 'assistant' && (
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full mt-0.5"
          style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}>
          <Bot className="h-3 w-3" />
        </div>
      )}
      <div
        className={`rounded-lg px-3 py-2 text-sm max-w-[80%] ${
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
          <ReactMarkdown components={markdownComponents as never}>
            {msg.content}
          </ReactMarkdown>
        )}
      </div>
      {msg.role === 'user' && (
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full mt-0.5"
          style={{ backgroundColor: 'var(--color-bg-hover)' }}>
          <User className="h-3 w-3" style={{ color: 'var(--color-text-secondary)' }} />
        </div>
      )}
    </div>
  );
});

export function ChatBot() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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

  // Use refs so sendMessage never changes identity — avoids re-renders on every keystroke
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

      // Handle navigation
      if (data.navigate) {
        router.push(data.navigate);
      }
    } catch {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, [router]);

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed z-50 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95 bottom-20 right-4 md:bottom-6 md:right-6"
          style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
          aria-label="Open AI assistant"
        >
          <MessageSquare className="h-5 w-5" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className={`fixed z-50 flex flex-col shadow-2xl border overflow-hidden transition-all duration-200 ${
            fullscreen
              ? 'inset-0 rounded-none'
              : 'rounded-xl bottom-20 right-4 md:bottom-6 md:right-6'
          }`}
          style={{
            backgroundColor: 'var(--color-bg)',
            borderColor: 'var(--color-border)',
            ...(fullscreen
              ? {}
              : {
                  width: 'min(400px, calc(100vw - 32px))',
                  height: 'min(560px, calc(100vh - 120px))',
                }),
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-2 px-4 py-3 shrink-0"
            style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
          >
            <Bot className="h-4 w-4" />
            <span className="text-sm font-medium flex-1">AI Assistant</span>
            <button
              onClick={() => setFullscreen(!fullscreen)}
              className="p-1 rounded-md hover:bg-white/20 transition-colors"
              aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button onClick={() => { setOpen(false); setFullscreen(false); }} className="p-1 rounded-md hover:bg-white/20 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <Bot className="h-8 w-8 mb-2" style={{ color: 'var(--color-text-muted)' }} />
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  Ask me about your devices, or tell me what to do.
                </p>
                <div className="mt-3 space-y-1">
                  {['What lights are on?', 'Show me the cameras', 'Help me set up an integration'].map((s) => (
                    <button
                      key={s}
                      onClick={() => { setInput(s); }}
                      className="block w-full text-xs px-3 py-1.5 rounded-md transition-colors text-left"
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
              <div className="flex gap-2 items-start">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}>
                  <Bot className="h-3 w-3" />
                </div>
                <div className="rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
                  <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--color-text-muted)' }} />
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-danger, #ef4444)' }}>
                {error}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="shrink-0 p-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
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
      )}
    </>
  );
}
