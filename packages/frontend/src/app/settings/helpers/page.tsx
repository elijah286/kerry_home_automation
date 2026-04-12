'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { SlidePanel } from '@/components/ui/SlidePanel';
import { ArrowLeft, Plus, RefreshCw, Trash2, Pencil, ToggleLeft, Code } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { HelperDefinition, HelperType } from '@ha/shared';
import { HELPER_TYPES } from '@ha/shared';
import { getHelpers, createHelper, updateHelper, deleteHelper, reloadHelpers, getHelpersYaml, saveHelpersYaml } from '@/lib/api';
import HelperConfigForm from './HelperConfigForm';

type Tab = 'list' | 'yaml';

export default function HelpersPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('list');
  const [helpers, setHelpers] = useState<HelperDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Slide panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingHelper, setEditingHelper] = useState<HelperDefinition | null>(null);
  const [selectedType, setSelectedType] = useState<HelperType | null>(null);
  const [showTypeSelector, setShowTypeSelector] = useState(false);

  // YAML editor
  const [yamlContent, setYamlContent] = useState('');
  const [yamlLoading, setYamlLoading] = useState(false);
  const [yamlMessage, setYamlMessage] = useState<string | null>(null);

  const fetchHelpers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getHelpers();
      setHelpers(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHelpers(); }, [fetchHelpers]);

  const handleReload = async () => {
    try {
      await reloadHelpers();
      await fetchHelpers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Delete helper "${id}"?`)) return;
    try {
      await deleteHelper(id);
      await fetchHelpers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleEdit = (helper: HelperDefinition) => {
    setEditingHelper(helper);
    setSelectedType(helper.type);
    setPanelOpen(true);
    setShowTypeSelector(false);
  };

  const handleAddNew = () => {
    setEditingHelper(null);
    setSelectedType(null);
    setShowTypeSelector(true);
    setPanelOpen(true);
  };

  const handleTypeSelect = (type: HelperType) => {
    setSelectedType(type);
    setShowTypeSelector(false);
  };

  const handleSave = async (def: HelperDefinition) => {
    try {
      if (editingHelper) {
        await updateHelper(def.id, def);
      } else {
        await createHelper(def);
      }
      setPanelOpen(false);
      setEditingHelper(null);
      setSelectedType(null);
      await fetchHelpers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleLoadYaml = async () => {
    setYamlLoading(true);
    try {
      const content = await getHelpersYaml();
      setYamlContent(content);
    } catch (err: any) {
      setYamlMessage(`Error: ${err.message}`);
    } finally {
      setYamlLoading(false);
    }
  };

  const handleSaveYaml = async () => {
    setYamlLoading(true);
    setYamlMessage(null);
    try {
      const result = await saveHelpersYaml(yamlContent);
      setYamlMessage(`Saved and reloaded ${result.count} helpers`);
      await fetchHelpers();
    } catch (err: any) {
      setYamlMessage(`Error: ${err.message}`);
    } finally {
      setYamlLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'yaml') handleLoadYaml();
  }, [tab]);

  const typeName = (type: HelperType) => HELPER_TYPES.find((t) => t.type === type)?.name ?? type;

  const categoryBadge = (type: HelperType) => {
    const info = HELPER_TYPES.find((t) => t.type === type);
    if (!info) return null;
    const variant = info.category === 'basic' ? 'info' : info.category === 'sensor' ? 'success' : 'warning';
    return <Badge variant={variant}>{info.category}</Badge>;
  };

  return (
    <div className="max-w-4xl mx-auto p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/settings')} className="p-1 rounded hover:bg-[var(--color-bg-hover)]">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}>
          <ToggleLeft className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
        </div>
        <h1 className="text-lg font-semibold flex-1">Helpers</h1>
        <button
          onClick={handleReload}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <RefreshCw className="h-3 w-3" /> Reload
        </button>
        <button
          onClick={handleAddNew}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md text-white"
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          <Plus className="h-3 w-3" /> Add Helper
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-0.5 rounded-lg" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
        <button
          onClick={() => setTab('list')}
          className="flex-1 px-3 py-1.5 text-xs rounded-md font-medium transition-colors flex items-center justify-center gap-1.5"
          style={{
            backgroundColor: tab === 'list' ? 'var(--color-bg-card)' : 'transparent',
            color: tab === 'list' ? 'var(--color-text)' : 'var(--color-text-muted)',
          }}
        >
          <ToggleLeft className="h-3 w-3" /> Helpers
        </button>
        <button
          onClick={() => setTab('yaml')}
          className="flex-1 px-3 py-1.5 text-xs rounded-md font-medium transition-colors flex items-center justify-center gap-1.5"
          style={{
            backgroundColor: tab === 'yaml' ? 'var(--color-bg-card)' : 'transparent',
            color: tab === 'yaml' ? 'var(--color-text)' : 'var(--color-text-muted)',
          }}
        >
          <Code className="h-3 w-3" /> YAML
        </button>
      </div>

      {error && (
        <div className="text-xs px-3 py-2 rounded-md" style={{ backgroundColor: 'var(--color-danger)', color: 'white' }}>
          {error}
        </div>
      )}

      {/* List Tab */}
      {tab === 'list' && (
        <div className="space-y-2">
          {loading ? (
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading...</p>
          ) : helpers.length === 0 ? (
            <Card>
              <p className="text-sm text-center py-8" style={{ color: 'var(--color-text-muted)' }}>
                No helpers defined. Click "Add Helper" to create your first virtual device.
              </p>
            </Card>
          ) : (
            helpers.map((h) => (
              <Card key={h.id}>
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{h.name}</span>
                      <Badge variant="default">{typeName(h.type)}</Badge>
                      {categoryBadge(h.type)}
                      {h.enabled === false && <Badge variant="warning">Disabled</Badge>}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                      {h.id}
                    </p>
                  </div>
                  <button
                    onClick={() => handleEdit(h)}
                    className="p-1.5 rounded hover:bg-[var(--color-bg-hover)]"
                  >
                    <Pencil className="h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} />
                  </button>
                  <button
                    onClick={() => handleDelete(h.id)}
                    className="p-1.5 rounded hover:bg-[var(--color-bg-hover)]"
                  >
                    <Trash2 className="h-3.5 w-3.5" style={{ color: 'var(--color-danger)' }} />
                  </button>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* YAML Tab */}
      {tab === 'yaml' && (
        <div className="space-y-3">
          <textarea
            value={yamlContent}
            onChange={(e) => setYamlContent(e.target.value)}
            className="w-full h-96 p-3 rounded-md border text-xs font-mono resize-y"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
            }}
            spellCheck={false}
          />
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveYaml}
              disabled={yamlLoading}
              className="px-3 py-1.5 text-xs rounded-md text-white"
              style={{ backgroundColor: 'var(--color-accent)' }}
            >
              {yamlLoading ? 'Saving...' : 'Save & Reload'}
            </button>
            <button
              onClick={handleLoadYaml}
              disabled={yamlLoading}
              className="px-3 py-1.5 text-xs rounded-md border"
              style={{ borderColor: 'var(--color-border)' }}
            >
              Revert
            </button>
            {yamlMessage && (
              <span className="text-xs" style={{ color: yamlMessage.startsWith('Error') ? 'var(--color-danger)' : 'var(--color-success)' }}>
                {yamlMessage}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Slide Panel for Add/Edit */}
      <SlidePanel open={panelOpen} onClose={() => { setPanelOpen(false); setShowTypeSelector(false); setSelectedType(null); setEditingHelper(null); }} title={editingHelper ? `Edit: ${editingHelper.name}` : selectedType ? `New ${typeName(selectedType)}` : 'Select Helper Type'}>
        {showTypeSelector && !selectedType ? (
          <div className="grid grid-cols-2 gap-2 p-4">
            {HELPER_TYPES.map((ht) => (
              <button
                key={ht.type}
                onClick={() => handleTypeSelect(ht.type)}
                className="p-3 rounded-lg border text-left hover:bg-[var(--color-bg-hover)] transition-colors"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <div className="text-sm font-medium">{ht.name}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{ht.description}</div>
              </button>
            ))}
          </div>
        ) : selectedType ? (
          <div className="p-4">
            <HelperConfigForm
              type={selectedType}
              initial={editingHelper ?? undefined}
              onSave={handleSave}
              onCancel={() => { setPanelOpen(false); setSelectedType(null); setEditingHelper(null); }}
            />
          </div>
        ) : null}
      </SlidePanel>
    </div>
  );
}
