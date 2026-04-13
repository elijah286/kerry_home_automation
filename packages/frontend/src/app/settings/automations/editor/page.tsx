'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, Save, RotateCcw, Loader2, ArrowLeft, Check, AlertTriangle } from 'lucide-react';
import { getAutomationsYaml, saveAutomationsYaml } from '@/lib/api';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { yaml as yamlLang } from '@codemirror/lang-yaml';
import { oneDark } from '@codemirror/theme-one-dark';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, foldGutter, indentOnInput } from '@codemirror/language';
import { lintGutter } from '@codemirror/lint';

export default function AutomationsEditorPage() {
  const router = useRouter();
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [original, setOriginal] = useState('');
  const [dirty, setDirty] = useState(false);

  // Load YAML data
  useEffect(() => {
    getAutomationsYaml()
      .then(({ yaml }) => {
        setContent(yaml);
        setOriginal(yaml);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  // Initialize CodeMirror once content is loaded and the div is mounted
  useEffect(() => {
    if (content === null || !editorRef.current || viewRef.current) return;

    const theme = EditorView.theme({
      '&': {
        height: '100%',
        fontSize: '13px',
        backgroundColor: 'var(--color-bg-secondary)',
      },
      '.cm-scroller': {
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      },
      '.cm-gutters': {
        backgroundColor: 'var(--color-bg-secondary)',
        borderRight: '1px solid var(--color-border)',
      },
      '&.cm-focused': { outline: 'none' },
    });

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        setDirty(true);
        setSaved(false);
      }
    });

    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        drawSelection(),
        bracketMatching(),
        foldGutter(),
        indentOnInput(),
        lintGutter(),
        yamlLang(),
        oneDark,
        theme,
        keymap.of([...defaultKeymap, indentWithTab]),
        updateListener,
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [content]);

  const handleSave = async () => {
    if (!viewRef.current) return;
    const doc = viewRef.current.state.doc.toString();
    setSaving(true);
    setError(null);
    try {
      await saveAutomationsYaml(doc);
      setOriginal(doc);
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = () => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      changes: { from: 0, to: viewRef.current.state.doc.length, insert: original },
    });
    setDirty(false);
    setError(null);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 lg:px-6 py-3 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/settings/automations')}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-bg-hover)]"
            aria-label="Back to automations"
          >
            <ArrowLeft className="h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
          </button>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}>
            <Zap className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
          </div>
          <div>
            <h1 className="text-lg font-semibold">YAML Editor</h1>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              All automations &middot; {dirty ? 'Unsaved changes' : 'Saved'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {error && (
            <span className="flex items-center gap-1 text-xs px-2 py-1 rounded" style={{ backgroundColor: 'var(--color-danger)', color: '#fff' }}>
              <AlertTriangle className="h-3 w-3" />
              {error}
            </span>
          )}
          {saved && (
            <span className="flex items-center gap-1 text-xs px-2 py-1 rounded" style={{ backgroundColor: 'var(--color-success, #22c55e)', color: '#fff' }}>
              <Check className="h-3 w-3" />
              Saved
            </span>
          )}
          <button
            onClick={handleRevert}
            disabled={!dirty}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors disabled:opacity-30"
            style={{ backgroundColor: 'var(--color-bg-hover)', color: 'var(--color-text)' }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Revert
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-white transition-colors disabled:opacity-30"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </button>
        </div>
      </div>

      {/* Editor */}
      {loading ? (
        <div className="flex items-center justify-center flex-1">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--color-text-muted)' }} />
        </div>
      ) : (
        <div ref={editorRef} className="flex-1 overflow-auto" />
      )}
    </div>
  );
}
