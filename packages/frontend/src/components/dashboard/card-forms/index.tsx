'use client';

// ---------------------------------------------------------------------------
// <CardForm> — structured, type-aware editor for a CardDescriptor.
//
// Dispatches on `card.type` to a dedicated per-type form. Unsupported/complex
// types (e.g. nested composites) fall back to the YAML editor so nothing
// becomes uneditable. Every change parses through the Zod schema in the
// parent (DashboardEditor) so invalid shapes are caught at save time.
//
// All form components are intentionally *uncontrolled-ish*: they read `card`
// as the source of truth and emit a fully-formed new CardDescriptor on each
// change. The parent does not need to debounce.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react';
import * as yaml from 'js-yaml';
import { ChevronDown, ChevronRight, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import {
  cardDescriptorSchema,
  type CardDescriptor,
  type CardType,
} from '@ha/shared';
import { PrimaryButton, SecondaryButton, GhostIconButton } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { CARD_TYPE_LABELS } from '@/lib/dashboard-editor/card-factory';
import { CardPalette } from '../CardPalette';
import {
  CheckboxField,
  EntityField,
  EntityListField,
  FieldGroup,
  FieldShell,
  NumberField,
  SegmentedField,
  TextAreaField,
  TextField,
} from './fields';
import { ActionField } from './ActionField';
import { IconPickerField } from './IconPickerField';

interface CardFormProps {
  card: CardDescriptor;
  onChange: (next: CardDescriptor) => void;
}

// Types that have dedicated forms. Anything else falls back to YAML.
const STRUCTURED_TYPES: ReadonlySet<CardType> = new Set<CardType>([
  'heading',
  'markdown',
  'button',
  'iframe-sandbox',
  'light-tile',
  'fan-tile',
  'cover-tile',
  'lock-tile',
  'switch-tile',
  'media-tile',
  'thermostat',
  'vehicle',
  'tesla',
  'door-window',
  'battery',
  'weather',
  'camera',
  'alarm-panel',
  'sensor-value',
  'gauge',
  'history-graph',
  'entity-list',
  'statistic',
  'alert-banner',
  'notification-inbox',
  'area-summary',
  'map',
  'vertical-stack',
  'horizontal-stack',
]);

export function CardForm({ card, onChange }: CardFormProps) {
  const [forceYaml, setForceYaml] = useState(false);
  const supported = STRUCTURED_TYPES.has(card.type);
  const showYaml = forceYaml || !supported;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end gap-2">
        {supported && (
          <button
            type="button"
            onClick={() => setForceYaml((v) => !v)}
            className="text-[11px] font-medium transition-colors hover:underline"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {showYaml ? '← Back to form' : 'Edit as YAML'}
          </button>
        )}
      </div>
      {showYaml ? (
        <YamlFallback card={card} onChange={onChange} />
      ) : (
        <StructuredDispatcher card={card} onChange={onChange} />
      )}
    </div>
  );
}

// -- Structured dispatcher -------------------------------------------------

function StructuredDispatcher({ card, onChange }: CardFormProps) {
  switch (card.type) {
    case 'heading':
      return <HeadingForm card={card} onChange={onChange} />;
    case 'markdown':
      return <MarkdownForm card={card} onChange={onChange} />;
    case 'button':
      return <ButtonForm card={card} onChange={onChange} />;
    case 'iframe-sandbox':
      return <IframeForm card={card} onChange={onChange} />;
    case 'thermostat':
      return <ThermostatForm card={card} onChange={onChange} />;
    case 'light-tile':
    case 'fan-tile':
    case 'cover-tile':
    case 'lock-tile':
    case 'switch-tile':
    case 'media-tile':
    case 'vehicle':
    case 'camera':
    case 'alarm-panel':
      return <EntityTileForm card={card} onChange={onChange} />;
    case 'tesla':
      return <TeslaForm card={card} onChange={onChange} />;
    case 'door-window':
      return <DoorWindowForm card={card} onChange={onChange} />;
    case 'battery':
      return <BatteryForm card={card} onChange={onChange} />;
    case 'weather':
      return <WeatherForm card={card} onChange={onChange} />;
    case 'sensor-value':
      return <SensorValueForm card={card} onChange={onChange} />;
    case 'gauge':
      return <GaugeForm card={card} onChange={onChange} />;
    case 'history-graph':
      return <HistoryGraphForm card={card} onChange={onChange} />;
    case 'entity-list':
      return <EntityListForm card={card} onChange={onChange} />;
    case 'statistic':
      return <StatisticForm card={card} onChange={onChange} />;
    case 'alert-banner':
      return <AlertBannerForm card={card} onChange={onChange} />;
    case 'notification-inbox':
      return <NotificationInboxForm card={card} onChange={onChange} />;
    case 'area-summary':
      return <AreaSummaryForm card={card} onChange={onChange} />;
    case 'map':
      return <MapForm card={card} onChange={onChange} />;
    case 'vertical-stack':
    case 'horizontal-stack':
      return <StackForm card={card} onChange={onChange} />;
    default:
      return <YamlFallback card={card} onChange={onChange} />;
  }
}

// -- Typed helpers ---------------------------------------------------------

type Patch<T> = (patch: Partial<T>) => void;
function usePatch<T extends CardDescriptor>(
  card: T,
  onChange: (next: CardDescriptor) => void,
): Patch<T> {
  return (patch) => onChange({ ...card, ...patch } as CardDescriptor);
}

// -- Primitive forms -------------------------------------------------------

function HeadingForm({ card, onChange }: { card: Extract<CardDescriptor, { type: 'heading' }>; onChange: (c: CardDescriptor) => void }) {
  const patch = usePatch(card, onChange);
  return (
    <FieldGroup>
      <TextField label="Text" value={card.text} onChange={(text) => patch({ text: text ?? '' })} />
      <SegmentedField
        label="Style"
        value={card.style}
        onChange={(style) => patch({ style })}
        options={[
          { value: 'title', label: 'Title' },
          { value: 'subtitle', label: 'Subtitle' },
          { value: 'caption', label: 'Caption' },
        ]}
      />
      <IconPickerField value={card.icon} onChange={(icon) => patch({ icon })} />
    </FieldGroup>
  );
}

function MarkdownForm({ card, onChange }: { card: Extract<CardDescriptor, { type: 'markdown' }>; onChange: (c: CardDescriptor) => void }) {
  const patch = usePatch(card, onChange);
  return (
    <FieldGroup>
      <TextField label="Title (optional)" value={card.title} onChange={(title) => patch({ title })} />
      <TextAreaField
        label="Content (Markdown)"
        rows={8}
        value={card.content}
        onChange={(content) => patch({ content })}
      />
    </FieldGroup>
  );
}

function ButtonForm({ card, onChange }: { card: Extract<CardDescriptor, { type: 'button' }>; onChange: (c: CardDescriptor) => void }) {
  const patch = usePatch(card, onChange);
  return (
    <FieldGroup>
      <TextField label="Name" value={card.name} onChange={(name) => patch({ name })} />
      <IconPickerField value={card.icon} onChange={(icon) => patch({ icon })} />
      <EntityField
        label="Entity (optional)"
        hint="Drives on/off appearance; leave blank for pure action buttons."
        value={card.entity}
        onChange={(entity) => patch({ entity: entity || undefined })}
      />
      <CheckboxField
        label="Show state under name"
        value={card.showState}
        onChange={(showState) => patch({ showState })}
      />
      <ActionField
        label="Tap action"
        value={card.tapAction}
        onChange={(tapAction) => patch({ tapAction: tapAction ?? { type: 'none' } })}
      />
      <ActionField
        label="Hold action (optional)"
        value={card.holdAction}
        onChange={(holdAction) => patch({ holdAction })}
        clearable
      />
      <ActionField
        label="Double-tap action (optional)"
        value={card.doubleTapAction}
        onChange={(doubleTapAction) => patch({ doubleTapAction })}
        clearable
      />
    </FieldGroup>
  );
}

function IframeForm({ card, onChange }: { card: Extract<CardDescriptor, { type: 'iframe-sandbox' }>; onChange: (c: CardDescriptor) => void }) {
  const patch = usePatch(card, onChange);
  return (
    <FieldGroup>
      <TextField label="Title (optional)" value={card.title} onChange={(title) => patch({ title })} />
      <TextField
        label="URL (https only)"
        placeholder="https://example.com"
        value={card.url}
        onChange={(url) => patch({ url: url ?? '' })}
      />
      <TextField
        label='Aspect ratio (e.g. "16:9")'
        value={card.aspectRatio}
        onChange={(aspectRatio) => patch({ aspectRatio })}
      />
    </FieldGroup>
  );
}

// -- Device tiles (all share "entity + optional name + optional icon") -----

function EntityTileForm({ card, onChange }: { card: Extract<CardDescriptor, { entity: string }>; onChange: (c: CardDescriptor) => void }) {
  const bag = card as unknown as { entity: string; name?: string; icon?: string };
  const patch = (u: Partial<{ entity: string; name: string | undefined; icon: string | undefined }>) =>
    onChange({ ...card, ...u } as CardDescriptor);
  return (
    <FieldGroup>
      <EntityField value={bag.entity} onChange={(entity) => patch({ entity })} />
      <TextField label="Name (optional)" value={bag.name} onChange={(name) => patch({ name })} />
      <IconPickerField value={bag.icon} onChange={(icon) => patch({ icon })} />
    </FieldGroup>
  );
}

// -- Data cards ------------------------------------------------------------

function SensorValueForm({ card, onChange }: { card: Extract<CardDescriptor, { type: 'sensor-value' }>; onChange: (c: CardDescriptor) => void }) {
  const patch = usePatch(card, onChange);
  return (
    <FieldGroup>
      <EntityField value={card.entity} onChange={(entity) => patch({ entity })} />
      <TextField label="Name" value={card.name} onChange={(name) => patch({ name })} />
      <IconPickerField value={card.icon} onChange={(icon) => patch({ icon })} />
      <SegmentedField
        label="Style"
        value={card.style}
        onChange={(style) => patch({ style })}
        options={[
          { value: 'compact', label: 'Compact' },
          { value: 'big', label: 'Hero' },
        ]}
      />
      <SegmentedField
        label="Format (optional)"
        value={card.format}
        onChange={(format) => patch({ format })}
        options={[
          { value: 'number', label: 'Number' },
          { value: 'percent', label: '%' },
          { value: 'temperature', label: '°' },
          { value: 'duration', label: 'Duration' },
          { value: 'bytes', label: 'Bytes' },
          { value: 'relative-time', label: 'Relative' },
        ]}
      />
      <NumberField
        label="Precision (decimals)"
        value={card.precision}
        min={0}
        max={6}
        step={1}
        onChange={(precision) => patch({ precision })}
      />
    </FieldGroup>
  );
}

function GaugeForm({ card, onChange }: { card: Extract<CardDescriptor, { type: 'gauge' }>; onChange: (c: CardDescriptor) => void }) {
  const patch = usePatch(card, onChange);
  return (
    <FieldGroup>
      <EntityField value={card.entity} onChange={(entity) => patch({ entity })} />
      <TextField label="Name" value={card.name} onChange={(name) => patch({ name })} />
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Min" value={card.min} onChange={(v) => patch({ min: v ?? 0 })} />
        <NumberField label="Max" value={card.max} onChange={(v) => patch({ max: v ?? 100 })} />
      </div>
      <TextField label="Unit" value={card.unit} onChange={(unit) => patch({ unit })} />
      <CheckboxField
        label="Show sparkline"
        value={card.showSparkline}
        onChange={(showSparkline) => patch({ showSparkline })}
      />
    </FieldGroup>
  );
}

function HistoryGraphForm({ card, onChange }: { card: Extract<CardDescriptor, { type: 'history-graph' }>; onChange: (c: CardDescriptor) => void }) {
  const patch = usePatch(card, onChange);
  return (
    <FieldGroup>
      <TextField label="Title" value={card.title} onChange={(title) => patch({ title })} />
      <EntityListField
        label="Entities"
        minItems={1}
        value={card.entities}
        onChange={(entities) => patch({ entities })}
      />
      <NumberField
        label="Hours to show"
        value={card.hoursToShow}
        min={1}
        step={1}
        onChange={(v) => patch({ hoursToShow: v ?? 12 })}
      />
      <CheckboxField
        label="Logarithmic scale"
        value={card.logarithmicScale}
        onChange={(logarithmicScale) => patch({ logarithmicScale })}
      />
      <NumberField
        label="Max points (optional)"
        value={card.maxPoints}
        min={1}
        step={1}
        onChange={(maxPoints) => patch({ maxPoints })}
      />
    </FieldGroup>
  );
}

function EntityListForm({ card, onChange }: { card: Extract<CardDescriptor, { type: 'entity-list' }>; onChange: (c: CardDescriptor) => void }) {
  const patch = usePatch(card, onChange);
  // For the form, we only support the simple string[] variant. Richer rows
  // (per-row icon/name/style) still round-trip — editing those requires YAML.
  const asStrings = card.entities.map((e) => (typeof e === 'string' ? e : e.entity));
  const anyRich = card.entities.some((e) => typeof e !== 'string');
  return (
    <FieldGroup>
      <TextField label="Title" value={card.title} onChange={(title) => patch({ title })} />
      {anyRich && (
        <p className="text-[11px]" style={{ color: 'var(--color-warning)' }}>
          Some rows have custom name/icon overrides. Edit via YAML to preserve them.
        </p>
      )}
      <EntityListField
        label="Entities"
        minItems={1}
        value={asStrings}
        onChange={(entities) => patch({ entities })}
      />
      <CheckboxField
        label="Show header toggle"
        value={card.showHeaderToggle}
        onChange={(showHeaderToggle) => patch({ showHeaderToggle })}
      />
    </FieldGroup>
  );
}

function StatisticForm({ card, onChange }: { card: Extract<CardDescriptor, { type: 'statistic' }>; onChange: (c: CardDescriptor) => void }) {
  const patch = usePatch(card, onChange);
  return (
    <FieldGroup>
      <EntityField value={card.entity} onChange={(entity) => patch({ entity })} />
      <TextField label="Name" value={card.name} onChange={(name) => patch({ name })} />
      <SegmentedField
        label="Statistic"
        value={card.stat}
        onChange={(stat) => patch({ stat })}
        options={[
          { value: 'mean', label: 'Mean' },
          { value: 'min', label: 'Min' },
          { value: 'max', label: 'Max' },
          { value: 'sum', label: 'Sum' },
          { value: 'change', label: 'Change' },
          { value: 'last', label: 'Last' },
        ]}
      />
      <SegmentedField
        label="Period"
        value={card.period}
        onChange={(period) => patch({ period })}
        options={[
          { value: 'hour', label: 'Hour' },
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
        ]}
      />
      <TextField label="Unit" value={card.unit} onChange={(unit) => patch({ unit })} />
      <NumberField
        label="Precision"
        min={0}
        max={6}
        step={1}
        value={card.precision}
        onChange={(precision) => patch({ precision })}
      />
    </FieldGroup>
  );
}

// -- Notification/area/map forms ------------------------------------------

function AlertBannerForm({ card, onChange }: { card: Extract<CardDescriptor, { type: 'alert-banner' }>; onChange: (c: CardDescriptor) => void }) {
  const patch = usePatch(card, onChange);
  return (
    <FieldGroup>
      <CheckboxField
        label="Hide when empty"
        value={card.hideWhenEmpty}
        onChange={(hideWhenEmpty) => patch({ hideWhenEmpty })}
      />
    </FieldGroup>
  );
}

function NotificationInboxForm({ card, onChange }: { card: Extract<CardDescriptor, { type: 'notification-inbox' }>; onChange: (c: CardDescriptor) => void }) {
  const patch = usePatch(card, onChange);
  return (
    <FieldGroup>
      <TextField label="Title" value={card.title} onChange={(title) => patch({ title })} />
      <NumberField
        label="Max rows"
        min={1}
        step={1}
        value={card.maxRows}
        onChange={(v) => patch({ maxRows: v ?? 5 })}
      />
      <CheckboxField
        label="Include resolved"
        value={card.includeResolved}
        onChange={(includeResolved) => patch({ includeResolved })}
      />
    </FieldGroup>
  );
}

function AreaSummaryForm({ card, onChange }: { card: Extract<CardDescriptor, { type: 'area-summary' }>; onChange: (c: CardDescriptor) => void }) {
  const patch = usePatch(card, onChange);
  return (
    <FieldGroup>
      <TextField
        label="Area id"
        placeholder="living-room"
        value={card.areaId}
        onChange={(areaId) => patch({ areaId: areaId ?? '' })}
      />
    </FieldGroup>
  );
}

function MapForm({ card, onChange }: { card: Extract<CardDescriptor, { type: 'map' }>; onChange: (c: CardDescriptor) => void }) {
  const patch = usePatch(card, onChange);
  return (
    <FieldGroup>
      <EntityListField
        label="Tracker entities"
        minItems={1}
        value={card.entities}
        onChange={(entities) => patch({ entities })}
      />
    </FieldGroup>
  );
}

// -- Stacks ---------------------------------------------------------------

function StackForm({ card, onChange }: { card: Extract<CardDescriptor, { type: 'vertical-stack' | 'horizontal-stack' }>; onChange: (c: CardDescriptor) => void }) {
  const patch = usePatch(card, onChange);
  return (
    <FieldGroup>
      <SegmentedField
        label="Gap"
        value={card.gap}
        onChange={(gap) => patch({ gap })}
        options={[
          { value: 'none', label: 'None' },
          { value: 'sm', label: 'sm' },
          { value: 'md', label: 'md' },
          { value: 'lg', label: 'lg' },
        ]}
      />
      <ChildrenEditor
        label="Children"
        children={card.children}
        onChange={(children) => patch({ children } as Partial<typeof card>)}
      />
    </FieldGroup>
  );
}

// ---------------------------------------------------------------------------
// ChildrenEditor — per-row expandable CardForm, reorder + delete + add.
// Used by stack cards so nested children are editable in-place with the same
// structured tooling (search-as-you-type entity picker, etc.) as top-level
// cards — no YAML required.
// ---------------------------------------------------------------------------

function ChildrenEditor({
  label,
  children,
  onChange,
}: {
  label: string;
  children: CardDescriptor[];
  onChange: (next: CardDescriptor[]) => void;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const replace = (i: number, next: CardDescriptor) => {
    const arr = children.slice();
    arr[i] = next;
    onChange(arr);
  };
  const remove = (i: number) => {
    onChange(children.filter((_, j) => j !== i));
    setExpanded((cur) => (cur === i ? null : cur));
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= children.length) return;
    const arr = children.slice();
    [arr[i], arr[j]] = [arr[j], arr[i]];
    onChange(arr);
    setExpanded((cur) => (cur === i ? j : cur === j ? i : cur));
  };

  return (
    <FieldShell label={label}>
      <div className="flex flex-col gap-1.5">
        {children.length === 0 && (
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            No children yet — add one below.
          </p>
        )}
        {children.map((child, i) => {
          const open = expanded === i;
          const meta = CARD_TYPE_LABELS[child.type] ?? { label: child.type, description: '' };
          const preview = getChildPreviewName(child);
          return (
            <div
              key={i}
              className="rounded-lg"
              style={{
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
              }}
            >
              <div className="flex items-center gap-1 p-1.5">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : i)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left hover:bg-[var(--color-bg-hover)]"
                  aria-expanded={open}
                  title={open ? 'Collapse' : 'Expand to edit'}
                >
                  {open
                    ? <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />
                    : <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />}
                  <span
                    className="truncate text-xs font-medium"
                    style={{ color: 'var(--color-text)' }}
                  >
                    {meta.label}
                  </span>
                  {preview && (
                    <span
                      className="truncate text-[11px]"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      — {preview}
                    </span>
                  )}
                </button>
                <GhostIconButton
                  icon={ArrowUp}
                  aria-label="Move up"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                />
                <GhostIconButton
                  icon={ArrowDown}
                  aria-label="Move down"
                  disabled={i === children.length - 1}
                  onClick={() => move(i, 1)}
                />
                <GhostIconButton
                  icon={Trash2}
                  tone="danger"
                  aria-label="Remove child"
                  onClick={() => remove(i)}
                />
              </div>
              {open && (
                <div
                  className="border-t p-2"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <CardForm card={child} onChange={(next) => replace(i, next)} />
                </div>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="inline-flex items-center gap-1.5 self-start rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-bg-hover)]"
          style={{
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text)',
            border: '1px dashed var(--color-border)',
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add child
        </button>
      </div>

      <CardPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onPick={(card) => {
          onChange([...children, card]);
          setExpanded(children.length);
          setPaletteOpen(false);
        }}
      />
    </FieldShell>
  );
}

function getChildPreviewName(card: CardDescriptor): string | undefined {
  const c = card as Record<string, unknown>;
  if (typeof c.name === 'string' && c.name) return c.name;
  if (typeof c.title === 'string' && c.title) return c.title;
  if (typeof c.text === 'string' && c.text) return c.text;
  if (typeof c.entity === 'string' && c.entity) return c.entity;
  return undefined;
}

// -- YAML fallback --------------------------------------------------------

function YamlFallback({ card, onChange }: CardFormProps) {
  const yamlText = useMemo(
    () => yaml.dump(card, { lineWidth: 120, noRefs: true, sortKeys: false }),
    [card],
  );
  const [draft, setDraft] = useState(yamlText);
  const [error, setError] = useState<string | null>(null);

  // Re-seed when the upstream card identity changes (e.g. editor swapped).
  useEffect(() => {
    setDraft(yamlText);
    setError(null);
  }, [yamlText]);

  const apply = () => {
    try {
      const parsed = yaml.load(draft);
      const next = cardDescriptorSchema.parse(parsed);
      onChange(next);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
        No structured form for <code>{card.type}</code> yet — falling back to YAML.
      </p>
      <Textarea
        size="sm"
        mono
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={false}
        rows={Math.min(20, draft.split('\n').length + 1)}
      />
      {error && (
        <p className="text-xs" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <SecondaryButton onClick={() => { setDraft(yamlText); setError(null); }}>
          Revert
        </SecondaryButton>
        <PrimaryButton onClick={apply}>Apply YAML</PrimaryButton>
      </div>
    </div>
  );
}

// -- Thermostat -------------------------------------------------------------
//
// The thermostat schema already carries HA-parity options (size, presets, fan,
// humidity, mode, history). Earlier we routed it through EntityTileForm which
// exposed only name/entity/icon — so editing a thermostat felt broken. This
// dedicated form surfaces the full option set as visibility toggles + a size
// segmented control, matching how Home Assistant's climate card presents its
// "features" list.
function ThermostatForm({
  card,
  onChange,
}: {
  card: Extract<CardDescriptor, { type: 'thermostat' }>;
  onChange: (c: CardDescriptor) => void;
}) {
  const patch = usePatch(card, onChange);
  return (
    <FieldGroup>
      <EntityField value={card.entity} onChange={(entity) => patch({ entity })} />
      <TextField label="Name (optional)" value={card.name} onChange={(name) => patch({ name })} />
      <SegmentedField
        label="Size"
        hint="Compact is a single-line summary; hero fills the card column."
        value={card.size}
        onChange={(size) => patch({ size })}
        options={[
          { value: 'compact', label: 'Compact' },
          { value: 'default', label: 'Normal' },
          { value: 'hero', label: 'Large' },
        ]}
      />
      <FieldShell label="Controls" hint="Which controls to surface on the tile.">
        <div className="flex flex-col gap-1.5">
          <CheckboxField
            label="Mode selector (heat / cool / auto / off)"
            value={card.showModeControl}
            onChange={(showModeControl) => patch({ showModeControl })}
          />
          <CheckboxField
            label="Preset buttons (home / away / sleep …)"
            value={card.showPresets}
            onChange={(showPresets) => patch({ showPresets })}
          />
          <CheckboxField
            label="Fan mode selector"
            value={card.showFanControl}
            onChange={(showFanControl) => patch({ showFanControl })}
          />
          <CheckboxField
            label="Indoor humidity chip"
            value={card.showHumidity}
            onChange={(showHumidity) => patch({ showHumidity })}
          />
          <CheckboxField
            label="Inline setpoint/temperature history"
            value={card.showHistory}
            onChange={(showHistory) => patch({ showHistory })}
          />
        </div>
      </FieldShell>
    </FieldGroup>
  );
}

// -- New rich-card forms ----------------------------------------------------

function TeslaForm({ card, onChange }: { card: Extract<CardDescriptor, { type: 'tesla' }>; onChange: (c: CardDescriptor) => void }) {
  const patch = usePatch(card, onChange);
  return (
    <FieldGroup>
      <EntityField value={card.entity} onChange={(entity) => patch({ entity })} />
      <TextField label="Name (optional)" value={card.name} onChange={(name) => patch({ name })} />
      <CheckboxField label="Hide vehicle image" value={card.hideImage} onChange={(hideImage) => patch({ hideImage })} />
      <SegmentedField
        label="Image source"
        value={card.imageSource}
        onChange={(imageSource) => patch({ imageSource })}
        options={[
          { value: 'auto', label: 'Auto' },
          { value: 'compositor', label: 'Live render' },
          { value: 'silhouette', label: 'Silhouette' },
        ]}
      />
      <SegmentedField
        label="View angle"
        value={card.imageView}
        onChange={(imageView) => patch({ imageView })}
        options={[
          { value: 'STUD_3QTR', label: '3/4' },
          { value: 'STUD_SIDE', label: 'Side' },
          { value: 'STUD_REAR', label: 'Rear' },
          { value: 'STUD_SEAT', label: 'Interior' },
        ]}
      />
      <NumberField
        label="Image size (250–1920)"
        value={card.imageSize}
        min={250}
        max={1920}
        step={10}
        onChange={(imageSize) => patch({ imageSize: imageSize ?? 720 })}
      />
      <CheckboxField label="Show map link" value={card.showMap} onChange={(showMap) => patch({ showMap })} />
    </FieldGroup>
  );
}

function DoorWindowForm({ card, onChange }: { card: Extract<CardDescriptor, { type: 'door-window' }>; onChange: (c: CardDescriptor) => void }) {
  const patch = usePatch(card, onChange);
  return (
    <FieldGroup>
      <EntityField value={card.entity} onChange={(entity) => patch({ entity })} />
      <TextField label="Name (optional)" value={card.name} onChange={(name) => patch({ name })} />
      <SegmentedField
        label="Visual"
        value={card.visual}
        onChange={(visual) => patch({ visual })}
        options={[
          { value: 'auto', label: 'Auto' },
          { value: 'door', label: 'Door' },
          { value: 'window', label: 'Window' },
          { value: 'garage', label: 'Garage' },
          { value: 'gate', label: 'Gate' },
        ]}
      />
      <SegmentedField
        label="Size"
        value={card.size}
        onChange={(size) => patch({ size })}
        options={[
          { value: 'compact', label: 'Compact' },
          { value: 'default', label: 'Default' },
          { value: 'hero', label: 'Hero' },
        ]}
      />
      <CheckboxField
        label="Show last-changed timestamp"
        value={card.showLastChanged}
        onChange={(showLastChanged) => patch({ showLastChanged })}
      />
    </FieldGroup>
  );
}

function BatteryForm({ card, onChange }: { card: Extract<CardDescriptor, { type: 'battery' }>; onChange: (c: CardDescriptor) => void }) {
  const patch = usePatch(card, onChange);
  return (
    <FieldGroup>
      <EntityField value={card.entity} onChange={(entity) => patch({ entity })} />
      <TextField label="Name (optional)" value={card.name} onChange={(name) => patch({ name })} />
      <SegmentedField
        label="Style"
        value={card.style}
        onChange={(style) => patch({ style })}
        options={[
          { value: 'linear', label: 'Bar' },
          { value: 'radial', label: 'Radial' },
          { value: 'chip', label: 'Chip' },
        ]}
      />
      <CheckboxField
        label="Show remaining range / time"
        value={card.showRemaining}
        onChange={(showRemaining) => patch({ showRemaining })}
      />
    </FieldGroup>
  );
}

function WeatherForm({ card, onChange }: { card: Extract<CardDescriptor, { type: 'weather' }>; onChange: (c: CardDescriptor) => void }) {
  const patch = usePatch(card, onChange);
  const togglePane = (pane: 'current' | 'hourly' | 'daily' | 'alerts' | 'radar') => {
    const current = card.panes ?? [];
    const next = current.includes(pane)
      ? current.filter((p) => p !== pane)
      : [...current, pane];
    patch({ panes: next });
  };
  const has = (p: string) => (card.panes ?? []).includes(p as 'current');
  return (
    <FieldGroup>
      <EntityField value={card.entity} onChange={(entity) => patch({ entity })} />
      <TextField label="Name (optional)" value={card.name} onChange={(name) => patch({ name })} />
      <FieldShell label="Panes" hint="Which sections to render, in order.">
        <div className="flex flex-wrap gap-2">
          {(['current', 'hourly', 'daily', 'alerts', 'radar'] as const).map((p) => (
            <label key={p} className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={has(p)} onChange={() => togglePane(p)} />
              <span style={{ textTransform: 'capitalize' }}>{p}</span>
            </label>
          ))}
        </div>
      </FieldShell>
      <NumberField
        label="Hours to show"
        value={card.hoursToShow}
        min={1}
        max={48}
        step={1}
        onChange={(hoursToShow) => patch({ hoursToShow: hoursToShow ?? 12 })}
      />
      <NumberField
        label="Days to show"
        value={card.daysToShow}
        min={1}
        max={7}
        step={1}
        onChange={(daysToShow) => patch({ daysToShow: daysToShow ?? 7 })}
      />
      <SegmentedField
        label="Radar provider"
        value={card.radarProvider}
        onChange={(radarProvider) => patch({ radarProvider })}
        options={[
          { value: 'none', label: 'Off' },
          { value: 'rainviewer', label: 'RainViewer' },
        ]}
      />
      <SegmentedField
        label="Minimum alert severity"
        value={card.minAlertSeverity}
        onChange={(minAlertSeverity) => patch({ minAlertSeverity })}
        options={[
          { value: 'Minor', label: 'Minor' },
          { value: 'Moderate', label: 'Moderate' },
          { value: 'Severe', label: 'Severe' },
          { value: 'Extreme', label: 'Extreme' },
        ]}
      />
      <SegmentedField
        label="Size"
        value={card.size}
        onChange={(size) => patch({ size })}
        options={[
          { value: 'compact', label: 'Compact' },
          { value: 'default', label: 'Default' },
          { value: 'hero', label: 'Hero' },
        ]}
      />
    </FieldGroup>
  );
}
