'use client';

import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  memo,
  createContext,
  useContext,
  useMemo,
  type ReactNode,
  type CSSProperties,
} from 'react';
import type { LCARSFrameGeometry } from '@/components/lcars/LCARSFrameContext';
import { useRouter, usePathname } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import {
  MessageSquare,
  X,
  Send,
  Loader2,
  Bot,
  User,
  Maximize2,
  Minimize2,
  Timer,
  Play,
  Pause,
  RotateCcw,
  Plus,
  Pencil,
  MapPinned,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCookingTimers, formatCookingTimer } from '@/providers/CookingTimersProvider';
import { clsx } from 'clsx';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useLocationsMap } from '@/providers/LocationsMapContext';
import { getApiBase, apiFetch } from '@/lib/api-base';

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

/** LCARS main content rect + frame accent for docking the assistant (same box as SlidePanel). */
export type LcarsAssistantDockInset = LCARSFrameGeometry & { framePin: string };

export type RightPanelMode = 'assistant' | 'timers' | 'map_layers';

interface AssistantContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
  /** Set while LCARS frame is mounted; used because the assistant panel renders outside `.lcars-frame`. */
  lcarsDockInset: LcarsAssistantDockInset | null;
  setLcarsDockInset: (v: LcarsAssistantDockInset | null) => void;
  rightPanelMode: RightPanelMode;
  setRightPanelMode: (m: RightPanelMode) => void;
  /** Opens the right panel on the kitchen timers view (used from recipe detail). */
  openTimersPanel: () => void;
  /** Opens the right panel on the Locations map layers view. */
  openMapLayersPanel: () => void;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);

export function useAssistant(): AssistantContextValue {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error('useAssistant must be used within AssistantProvider');
  return ctx;
}

/** Pushes LCARS content insets into AssistantProvider so the assistant can match SlidePanel geometry. */
export function LCARSAssistantInsetSync({
  geometry,
  framePin,
}: {
  geometry: LCARSFrameGeometry;
  framePin: string;
}) {
  const { setLcarsDockInset } = useAssistant();
  useLayoutEffect(() => {
    setLcarsDockInset({ ...geometry, framePin });
    return () => setLcarsDockInset(null);
  }, [geometry, framePin, setLcarsDockInset]);
  return null;
}

export function AssistantHeaderButton({
  variant = 'default',
  className,
  style,
  'data-sound': dataSound,
}: {
  variant?: 'default' | 'lcars';
  className?: string;
  style?: CSSProperties;
  'data-sound'?: string;
}) {
  const { open, setOpen, rightPanelMode, setRightPanelMode } = useAssistant();

  const onClick = () => {
    if (open && rightPanelMode === 'timers') {
      setRightPanelMode('assistant');
      return;
    }
    if (open && rightPanelMode === 'map_layers') {
      setRightPanelMode('assistant');
      return;
    }
    if (open) {
      setOpen(false);
    } else {
      setRightPanelMode('assistant');
      setOpen(true);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      data-sound={dataSound}
      aria-label={
        open
          ? rightPanelMode === 'timers' || rightPanelMode === 'map_layers'
            ? 'Switch to AI assistant'
            : 'Close AI assistant'
          : 'Open AI assistant'
      }
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

/** Locations page — opens the shared right slide panel in map-layers mode (same shell as Assistant). */
export function MapLayersHeaderButton({
  variant = 'default',
  className,
  style,
  'data-sound': dataSound,
}: {
  variant?: 'default' | 'lcars';
  className?: string;
  style?: CSSProperties;
  'data-sound'?: string;
}) {
  const pathname = usePathname();
  const { open, setOpen, rightPanelMode, setRightPanelMode } = useAssistant();

  if (pathname !== '/locations') return null;

  const onClick = () => {
    if (open && rightPanelMode === 'map_layers') {
      setOpen(false);
      return;
    }
    if (open && rightPanelMode === 'timers') {
      setRightPanelMode('map_layers');
      return;
    }
    if (open && rightPanelMode === 'assistant') {
      setRightPanelMode('map_layers');
      return;
    }
    setRightPanelMode('map_layers');
    setOpen(true);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      data-sound={dataSound}
      aria-label={
        open && rightPanelMode === 'map_layers' ? 'Close map layers' : 'Open map layers'
      }
      aria-expanded={open && rightPanelMode === 'map_layers'}
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
          <MapPinned className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
          <span>Map layers</span>
        </>
      ) : (
        <MapPinned className="h-[18px] w-[18px]" strokeWidth={2} />
      )}
    </button>
  );
}

const QUICK_TIMER_PRESETS = [
  { label: '1 min', seconds: 60 },
  { label: '3 min', seconds: 180 },
  { label: '5 min', seconds: 300 },
  { label: '10 min', seconds: 600 },
  { label: '15 min', seconds: 900 },
  { label: '20 min', seconds: 1200 },
  { label: '30 min', seconds: 1800 },
  { label: '45 min', seconds: 2700 },
  { label: '1 hr', seconds: 3600 },
];

function KitchenTimersSidebarBody() {
  const { timers, addTimer, toggleTimer, resetTimer, removeTimer, updateTimerLabel, stopTimer } =
    useCookingTimers();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [customMinutes, setCustomMinutes] = useState('5');
  const [customLabel, setCustomLabel] = useState('');
  const [showPresets, setShowPresets] = useState(false);

  const commitEdit = (id: string) => {
    updateTimerLabel(id, editDraft);
    setEditingId(null);
  };

  const addCustom = () => {
    const parsed = parseInt(customMinutes, 10);
    const m = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    const label = customLabel.trim() || `${m} min`;
    addTimer(label, m * 60);
    setCustomLabel('');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {timers.length === 0 && (
          <p className="text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
            No active timers. Add one below or pick a preset.
          </p>
        )}
        {timers.map((t) => (
          <div
            key={t.id}
            className="rounded-lg border p-3 text-sm"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor:
                t.remainingSeconds === 0
                  ? 'color-mix(in srgb, var(--color-danger) 12%, var(--color-bg-secondary))'
                  : t.running
                    ? 'color-mix(in srgb, var(--color-success) 10%, var(--color-bg-secondary))'
                    : 'var(--color-bg-secondary)',
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div
                  className="font-mono text-xl font-semibold tabular-nums"
                  style={{
                    color:
                      t.remainingSeconds === 0
                        ? 'var(--color-danger)'
                        : t.running
                          ? 'var(--color-success)'
                          : 'var(--color-text)',
                  }}
                >
                  {formatCookingTimer(t.remainingSeconds)}
                </div>
                {editingId === t.id ? (
                  <div className="mt-2 flex gap-2">
                    <input
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEdit(t.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="min-w-0 flex-1 rounded-md border px-2 py-1 text-sm"
                      style={{
                        backgroundColor: 'var(--color-bg)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text)',
                      }}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => commitEdit(t.id)}
                      className="shrink-0 rounded-md px-2 py-1 text-xs font-medium"
                      style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <p className="mt-1 truncate" style={{ color: 'var(--color-text-secondary)' }}>
                    {t.label}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                {editingId !== t.id && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(t.id);
                      setEditDraft(t.label);
                    }}
                    className="rounded-md p-1.5 transition-colors hover:bg-[var(--color-bg-hover)]"
                    aria-label="Edit label"
                  >
                    <Pencil className="h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => stopTimer(t.id)}
                  disabled={!t.running}
                  className="rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:opacity-40 hover:bg-[var(--color-bg-hover)]"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  Stop
                </button>
                <button
                  type="button"
                  onClick={() => toggleTimer(t.id)}
                  className="rounded-md p-1.5 transition-colors hover:bg-[var(--color-bg-hover)]"
                  aria-label={t.running ? 'Pause' : 'Resume'}
                >
                  {t.running ? (
                    <Pause className="h-4 w-4" style={{ color: 'var(--color-text)' }} />
                  ) : (
                    <Play className="h-4 w-4" style={{ color: 'var(--color-text)' }} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => resetTimer(t.id)}
                  className="rounded-md p-1.5 transition-colors hover:bg-[var(--color-bg-hover)]"
                  aria-label="Reset"
                >
                  <RotateCcw className="h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    removeTimer(t.id);
                    if (editingId === t.id) setEditingId(null);
                  }}
                  className="rounded-md p-1.5 transition-colors hover:bg-[var(--color-bg-hover)]"
                  aria-label="Remove timer"
                >
                  <X className="h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="shrink-0 border-t p-3" style={{ borderColor: 'var(--color-border)' }}>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
          Add timer
        </p>
        {showPresets ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {QUICK_TIMER_PRESETS.map((qt) => (
              <button
                key={qt.seconds}
                type="button"
                onClick={() => {
                  addTimer(qt.label, qt.seconds);
                  setShowPresets(false);
                }}
                className="rounded-md border px-2.5 py-1.5 text-xs transition-colors hover:bg-[var(--color-bg-hover)]"
                style={{ color: 'var(--color-text-secondary)', borderColor: 'var(--color-border)' }}
              >
                {qt.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowPresets(false)}
              className="rounded-md px-2 py-1.5 text-xs"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowPresets(true)}
            className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed py-2 text-sm transition-colors hover:bg-[var(--color-bg-hover)]"
            style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border)' }}
          >
            <Plus className="h-4 w-4" /> Presets
          </button>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Minutes
            <input
              type="number"
              min={1}
              value={customMinutes}
              onChange={(e) => setCustomMinutes(e.target.value)}
              className="rounded-md border px-2 py-1.5 text-sm"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
              }}
            />
          </label>
          <label className="flex flex-[2] flex-col gap-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Label (optional)
            <input
              type="text"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder="e.g. Rice"
              className="rounded-md border px-2 py-1.5 text-sm"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
              }}
            />
          </label>
          <button
            type="button"
            onClick={addCustom}
            className="shrink-0 rounded-md px-3 py-2 text-sm font-medium"
            style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function MapLayersSidebarBody() {
  const { trackableDevices, hiddenIds, toggleDeviceOnMap } = useLocationsMap();

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <p className="mb-3 text-xs leading-snug" style={{ color: 'var(--color-text-secondary)' }}>
        Choose which locators appear on the map. Vehicles are listed even before GPS is available; the marker
        appears once a position is reported. Your choices are saved in this browser.
      </p>
      {trackableDevices.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          No vehicles or locators yet.
        </p>
      ) : (
        <ul className="m-0 list-none space-y-0.5 p-0">
          {trackableDevices.map((d) => (
            <li key={d.id}>
              <label
                className="flex cursor-pointer items-start gap-2 rounded px-1 py-1.5 text-sm hover:opacity-90"
                style={{ color: 'var(--color-text)' }}
              >
                <input
                  type="checkbox"
                  checked={!hiddenIds.has(d.id)}
                  onChange={() => toggleDeviceOnMap(d.id)}
                  className="accent-[var(--color-accent)] mt-0.5 h-3.5 w-3.5 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{d.displayName || d.name}</span>
                  {!d.hasPosition && (
                    <span
                      className="mt-0.5 block text-[11px] leading-tight"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      Waiting for GPS…
                    </span>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AssistantRightPanel() {
  const router = useRouter();
  const isMdUp = useMediaQuery('(min-width: 768px)');
  const { open, setOpen, lcarsDockInset, rightPanelMode } = useAssistant();
  const [fullscreen, setFullscreen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [toolStatuses, setToolStatuses] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const ttsEnabledRef = useRef(false);
  const streamingTextRef = useRef('');
  const abortControllerRef = useRef<AbortController | null>(null);

  const dockInFrame = lcarsDockInset !== null && isMdUp && !fullscreen;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, toolStatuses]);

  useEffect(() => {
    if (open && rightPanelMode === 'assistant' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open, rightPanelMode]);

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

  // Load chat history when assistant opens
  useEffect(() => {
    if (!open || rightPanelMode !== 'assistant' || messages.length > 0) return;
    const loadHistory = async () => {
      try {
        const res = await apiFetch(`${getApiBase()}/api/chat/history`);
        if (res.ok) {
          const data = await res.json() as { messages: Array<{ role: 'user' | 'assistant'; content: string }> };
          setMessages(data.messages);
        }
      } catch (err) {
        // Silently fail — don't show error to user
        console.error('Failed to load chat history:', err);
      }
    };
    loadHistory();
  }, [open, rightPanelMode]);

  const inputValRef = useRef(input);
  inputValRef.current = input;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const loadingRef = useRef(loading);
  loadingRef.current = loading;

  /** Strip markdown symbols so TTS reads cleanly */
  const stripMarkdown = (text: string) =>
    text
      .replace(/#{1,6}\s/g, '')
      .replace(/[*_`~]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\n+/g, ' ')
      .trim();

  const speakText = useCallback((text: string) => {
    if (!ttsEnabledRef.current || typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(stripMarkdown(text));
    utt.rate = 1.05;
    utt.pitch = 1.0;
    window.speechSynthesis.speak(utt);
  }, []);

  const toggleTts = useCallback(() => {
    const next = !ttsEnabledRef.current;
    ttsEnabledRef.current = next;
    setTtsEnabled(next);
    if (!next && typeof window !== 'undefined') window.speechSynthesis?.cancel();
  }, []);

  const stopMessage = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setLoading(false);
      setIsStreaming(false);
    }
  }, []);

  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? inputValRef.current).trim();
    if (!text || loadingRef.current) return;

    setInput('');
    setError(null);
    setToolStatuses([]);
    setIsStreaming(false);
    streamingTextRef.current = '';

    const newMessages: Message[] = [...messagesRef.current, { role: 'user', content: text }];
    setMessages(newMessages);
    setLoading(true);

    let assistantMsgAdded = false;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await apiFetch(`${getApiBase()}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? 'Something went wrong');
        setLoading(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(part.slice(6)) as {
              type: string; text?: string; tool?: string; label?: string; navigate?: string; error?: string;
            };
            if (event.type === 'token' && event.text) {
              if (!assistantMsgAdded) {
                assistantMsgAdded = true;
                setIsStreaming(true);
                streamingTextRef.current = event.text;
                setMessages((prev) => [...prev, { role: 'assistant', content: event.text! }]);
              } else {
                streamingTextRef.current += event.text;
                const t = streamingTextRef.current;
                setMessages((prev) => {
                  const next = [...prev];
                  next[next.length - 1] = { role: 'assistant', content: t };
                  return next;
                });
              }
            } else if (event.type === 'tool_status' && event.label) {
              setToolStatuses((prev) => [...prev.filter((s) => s !== event.label), event.label!]);
            } else if (event.type === 'done') {
              setToolStatuses([]);
              if (event.navigate) router.push(event.navigate);
              if (streamingTextRef.current) speakText(streamingTextRef.current);
            } else if (event.type === 'error' && event.error) {
              setError(event.error);
            }
          } catch {
            // malformed SSE chunk — skip
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was cancelled by user — don't show error
      } else {
        setError('Failed to connect to server');
      }
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
      setIsStreaming(false);
      setToolStatuses([]);
    }
  }, [router, speakText]);

  const startListening = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (typeof window !== 'undefined') && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    if (!SR) {
      setError('Voice input not supported in this browser. Try Chrome or Edge.');
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = new SR() as any;
    rec.lang = 'en-US';
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e: { results: SpeechRecognitionResultList }) => {
      const transcript = Array.from(e.results).map((r) => r[0].transcript).join('');
      setInput(transcript);
      if (e.results[e.results.length - 1].isFinal) {
        setIsListening(false);
        recognitionRef.current = null;
        void sendMessage(transcript);
      }
    };
    rec.onend = () => setIsListening(false);
    rec.onerror = (e: { error: string }) => {
      setIsListening(false);
      const errorMsg = e.error === 'no-speech'
        ? 'No speech detected. Try speaking again.'
        : e.error === 'network'
          ? 'Network error. Check your connection.'
          : e.error === 'permission-denied'
            ? 'Microphone permission denied. Check browser settings.'
            : `Voice input error: ${e.error}`;
      setError(errorMsg);
    };
    recognitionRef.current = rec;
    rec.start();
    setIsListening(true);
  }, [sendMessage]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setFullscreen(false);
  }, [setOpen]);

  const dockedSlideOffPx = dockInFrame && lcarsDockInset ? lcarsDockInset.contentRight + 24 : 0;

  const panelTransform = open
    ? fullscreen
      ? undefined
      : 'translateX(0)'
    : fullscreen
      ? 'translateX(100%)'
      : dockInFrame && lcarsDockInset
        ? `translateX(calc(100% + ${dockedSlideOffPx}px))`
        : 'translateX(100%)';

  return (
    <>
      {/* Backdrop */}
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
          'fixed z-[50] flex flex-col overflow-hidden transition-[transform,top,bottom,right] duration-200 ease-out',
          fullscreen && 'inset-0 rounded-none border-0 shadow-2xl',
          dockInFrame && 'rounded-none border-l-[4px]',
          !fullscreen && !dockInFrame && 'top-0 bottom-0 right-0 w-full max-w-[min(420px,100vw)] rounded-none border-l shadow-2xl',
          !open && 'pointer-events-none',
        )}
        style={{
          backgroundColor: 'var(--color-bg)',
          borderColor: 'var(--color-border)',
          ...(panelTransform !== undefined ? { transform: panelTransform } : {}),
          ...(fullscreen
            ? {}
            : dockInFrame && lcarsDockInset
              ? {
                  top: lcarsDockInset.contentTop,
                  bottom: lcarsDockInset.contentBottom,
                  right: lcarsDockInset.contentRight,
                  width: 'auto',
                  maxWidth: 'min(420px, 40vw)',
                  borderLeftColor: lcarsDockInset.framePin,
                  borderTopLeftRadius: 10,
                  borderBottomLeftRadius: 10,
                  filter: 'drop-shadow(-8px 0 24px rgba(0,0,0,0.5))',
                }
              : {
                  top: 0,
                  bottom: 0,
                  right: 0,
                  width: 'auto',
                  maxWidth: 'min(420px, 100vw)',
                  borderLeftColor: 'var(--color-border)',
                  borderTopLeftRadius: 0,
                  borderBottomLeftRadius: 0,
                  boxShadow: undefined,
                }),
        }}
        role="dialog"
        aria-modal={open}
        aria-label={
          rightPanelMode === 'timers'
            ? 'Kitchen timers'
            : rightPanelMode === 'map_layers'
              ? 'Map layers'
              : 'AI assistant'
        }
        aria-hidden={!open}
      >
        {/* Header */}
        <div
          className="flex shrink-0 items-center gap-2 px-4 py-3"
          style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
        >
          {rightPanelMode === 'timers' ? (
            <Timer className="h-4 w-4 shrink-0" />
          ) : rightPanelMode === 'map_layers' ? (
            <MapPinned className="h-4 w-4 shrink-0" />
          ) : (
            <Bot className="h-4 w-4 shrink-0" />
          )}
          <span className="flex-1 text-sm font-medium">
            {rightPanelMode === 'timers'
              ? 'Kitchen timers'
              : rightPanelMode === 'map_layers'
                ? 'Map layers'
                : 'AI Assistant'}
          </span>
          {rightPanelMode === 'assistant' && (
            <button
              type="button"
              onClick={toggleTts}
              className="rounded-md p-1 transition-colors hover:bg-white/20"
              aria-label={ttsEnabled ? 'Mute voice responses' : 'Enable voice responses'}
              title={ttsEnabled ? 'Voice responses on — click to mute' : 'Voice responses off — click to enable'}
            >
              {ttsEnabled
                ? <Volume2 className="h-4 w-4" />
                : <VolumeX className="h-4 w-4 opacity-60" />}
            </button>
          )}
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
            aria-label={
              rightPanelMode === 'timers'
                ? 'Close timers'
                : rightPanelMode === 'map_layers'
                  ? 'Close map layers'
                  : 'Close assistant'
            }
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {rightPanelMode === 'timers' ? (
          <KitchenTimersSidebarBody />
        ) : rightPanelMode === 'map_layers' ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <MapLayersSidebarBody />
          </div>
        ) : (
          <>
            {/* Messages */}
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

              {/* Thinking / tool status indicator — hidden once text starts streaming */}
              {loading && !isStreaming && (
                <div className="flex items-start gap-2">
                  <div
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
                  >
                    <Bot className="h-3 w-3" />
                  </div>
                  <div
                    className="rounded-lg px-3 py-2 text-xs"
                    style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-muted)' }}
                  >
                    {toolStatuses.length > 0 ? (
                      <div className="space-y-1.5">
                        {toolStatuses.map((s) => (
                          <div key={s} className="flex items-center gap-1.5">
                            <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                            <span>{s}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                        <span>Thinking…</span>
                      </div>
                    )}
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

            {/* Input row */}
            <div className="shrink-0 border-t p-3" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                  placeholder={isListening ? 'Listening…' : 'Ask something…'}
                  className="flex-1 rounded-md border px-3 py-2 text-sm transition-colors"
                  style={{
                    backgroundColor: isListening
                      ? 'color-mix(in srgb, var(--color-danger) 8%, var(--color-bg-secondary))'
                      : 'var(--color-bg-secondary)',
                    borderColor: isListening ? 'var(--color-danger)' : 'var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                  disabled={loading}
                />
                {/* Mic button */}
                <button
                  type="button"
                  onClick={isListening ? stopListening : startListening}
                  disabled={loading}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-40"
                  style={{
                    backgroundColor: isListening
                      ? 'var(--color-danger, #ef4444)'
                      : 'var(--color-bg-secondary)',
                    color: isListening ? '#fff' : 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border)',
                  }}
                  aria-label={isListening ? 'Stop listening' : 'Start voice input'}
                  title={isListening ? 'Stop listening' : 'Speak your message'}
                >
                  {isListening
                    ? <MicOff className="h-4 w-4" />
                    : <Mic className="h-4 w-4" />}
                </button>
                {/* Send or Stop button */}
                {loading ? (
                  <button
                    type="button"
                    onClick={stopMessage}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors"
                    style={{ backgroundColor: '#ef4444', color: '#fff' }}
                    title="Stop responding"
                    aria-label="Stop responding"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void sendMessage()}
                    disabled={!input.trim()}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-50"
                    style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
                  >
                    <Send className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>('assistant');
  const [lcarsDockInset, setLcarsDockInset] = useState<LcarsAssistantDockInset | null>(null);

  const openTimersPanel = useCallback(() => {
    setRightPanelMode('timers');
    setOpen(true);
  }, []);

  const openMapLayersPanel = useCallback(() => {
    setRightPanelMode('map_layers');
    setOpen(true);
  }, []);

  const toggle = useCallback(() => {
    setOpen((o) => {
      if (!o) setRightPanelMode('assistant');
      return !o;
    });
  }, []);

  const value = useMemo(
    () => ({
      open,
      setOpen,
      toggle,
      lcarsDockInset,
      setLcarsDockInset,
      rightPanelMode,
      setRightPanelMode,
      openTimersPanel,
      openMapLayersPanel,
    }),
    [open, toggle, lcarsDockInset, rightPanelMode, openTimersPanel, openMapLayersPanel],
  );

  return (
    <AssistantContext.Provider value={value}>
      {children}
      <AssistantRightPanel />
    </AssistantContext.Provider>
  );
}
