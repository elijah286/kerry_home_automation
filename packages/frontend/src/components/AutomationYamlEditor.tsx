'use client';

import { useRef, useEffect, useCallback, useMemo } from 'react';
import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { yaml } from '@codemirror/lang-yaml';
import { oneDark } from '@codemirror/theme-one-dark';
import { linter, Diagnostic } from '@codemirror/lint';
import { autocompletion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import type { DeviceState } from '@ha/shared';

interface AutomationYamlEditorProps {
  value: string;
  onChange: (value: string) => void;
  devices: DeviceState[];
}

// Parse device IDs from YAML text and find ones that don't exist
function findInvalidDeviceIds(
  text: string,
  deviceIds: Set<string>,
): { from: number; to: number; id: string }[] {
  const results: { from: number; to: number; id: string }[] = [];
  // Match deviceId: "value" or deviceId: value patterns
  const regex = /(?:deviceId|device_id)\s*:\s*["']?([^\s"'\n#]+)["']?/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const id = match[1];
    if (id && id.length > 2 && !deviceIds.has(id)) {
      const start = match.index + match[0].indexOf(id);
      results.push({ from: start, to: start + id.length, id });
    }
  }
  return results;
}

// Red underline for invalid device IDs
const invalidDeviceMark = Decoration.mark({ class: 'cm-invalid-device' });

function createDeviceValidationPlugin(deviceIds: Set<string>) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }
      update(update: ViewUpdate) {
        if (update.docChanged) {
          this.decorations = this.buildDecorations(update.view);
        }
      }
      buildDecorations(view: EditorView): DecorationSet {
        const text = view.state.doc.toString();
        const invalids = findInvalidDeviceIds(text, deviceIds);
        if (invalids.length === 0) return Decoration.none;
        return Decoration.set(
          invalids.map(i => invalidDeviceMark.range(i.from, i.to)),
          true,
        );
      }
    },
    { decorations: (v) => v.decorations },
  );
}

function createDeviceLinter(deviceIds: Set<string>) {
  return linter((view) => {
    const text = view.state.doc.toString();
    const invalids = findInvalidDeviceIds(text, deviceIds);
    return invalids.map<Diagnostic>((inv) => ({
      from: inv.from,
      to: inv.to,
      severity: 'error',
      message: `Unknown device: "${inv.id}"`,
    }));
  });
}

function createDeviceCompletion(devices: DeviceState[]) {
  return autocompletion({
    override: [
      (context: CompletionContext): CompletionResult | null => {
        // Only complete after deviceId: or device_id:
        const line = context.state.doc.lineAt(context.pos);
        const textBefore = line.text.slice(0, context.pos - line.from);
        const match = textBefore.match(/(?:deviceId|device_id)\s*:\s*["']?(\S*)$/);
        if (!match) return null;

        const prefix = match[1] ?? '';
        const from = context.pos - prefix.length;

        const options = devices
          .filter(d =>
            d.id.toLowerCase().includes(prefix.toLowerCase()) ||
            (d.displayName ?? d.name).toLowerCase().includes(prefix.toLowerCase())
          )
          .slice(0, 30)
          .map(d => ({
            label: d.id,
            detail: d.displayName ?? d.name,
            type: 'variable' as const,
          }));

        return { from, options };
      },
    ],
  });
}

// Custom theme for the editor
const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '12px',
  },
  '.cm-scroller': {
    overflow: 'auto',
  },
  '.cm-content': {
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
  },
  '.cm-invalid-device': {
    textDecoration: 'wavy underline red',
    textDecorationSkipInk: 'none',
  },
  '.cm-gutters': {
    borderRight: '1px solid var(--color-border)',
  },
  '.cm-tooltip-autocomplete': {
    fontSize: '11px',
  },
});

export function AutomationYamlEditor({ value, onChange, devices }: AutomationYamlEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const deviceIds = useMemo(() => new Set(devices.map(d => d.id)), [devices]);

  const extensions = useMemo(() => [
    basicSetup,
    yaml(),
    oneDark,
    editorTheme,
    createDeviceValidationPlugin(deviceIds),
    createDeviceLinter(deviceIds),
    createDeviceCompletion(devices),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString());
      }
    }),
  ], [deviceIds, devices]);

  // Create editor
  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only recreate on extensions change, not value change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extensions]);

  // Sync external value changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="rounded-lg border overflow-hidden"
      style={{
        borderColor: 'var(--color-border)',
        minHeight: '400px',
        maxHeight: '70vh',
      }}
    />
  );
}
