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
import {
  cardDescriptorSchema,
  type CardDescriptor,
  type CardType,
} from '@ha/shared';
import { token } from '@/lib/tokens';
import {
  CheckboxField,
  EntityField,
  EntityListField,
  FieldGroup,
  NumberField,
  SegmentedField,
  TextAreaField,
  TextField,
} from './fields';
import { ActionField } from './ActionField';

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
            className="text-[11px] underline"
            style={{ color: token('--color-text-muted') }}
          >
            {showYaml ? 'Back to form' : 'Edit as YAML'}
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
    case 'light-tile':
    case 'fan-tile':
    case 'cover-tile':
    case 'lock-tile':
    case 'switch-tile':
    case 'media-tile':
    case 'thermostat':
    case 'vehicle':
    case 'camera':
    case 'alarm-panel':
      return <EntityTileForm card={card} onChange={onChange} />;
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
      <TextField label="Icon (mdi:* or emoji)" value={card.icon} onChange={(icon) => patch({ icon })} />
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
      <TextField label="Icon (mdi:* or emoji)" value={card.icon} onChange={(icon) => patch({ icon })} />
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
      <TextField
        label="Icon (mdi:* or emoji)"
        value={bag.icon}
        onChange={(icon) => patch({ icon })}
      />
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
      <TextField label="Icon (mdi:* or emoji)" value={card.icon} onChange={(icon) => patch({ icon })} />
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
        <p className="text-[11px]" style={{ color: token('--color-warning') }}>
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
      <p className="text-[11px]" style={{ color: token('--color-text-muted') }}>
        {card.children.length} child{card.children.length === 1 ? '' : 'ren'}. Children are
        edited as YAML for now.
      </p>
    </FieldGroup>
  );
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
      <p className="text-[11px]" style={{ color: token('--color-text-muted') }}>
        No structured form for <code>{card.type}</code> yet — falling back to YAML.
      </p>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={false}
        rows={Math.min(20, draft.split('\n').length + 1)}
        className="w-full rounded p-2 font-mono text-xs"
        style={{
          background: token('--color-bg-secondary'),
          color: token('--color-text'),
          border: `1px solid ${token('--color-border')}`,
        }}
      />
      {error && (
        <p className="text-xs" style={{ color: token('--color-danger') }}>
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => { setDraft(yamlText); setError(null); }}
          className="rounded px-3 py-1 text-xs"
          style={{
            background: token('--color-bg-secondary'),
            color: token('--color-text'),
          }}
        >
          Revert
        </button>
        <button
          type="button"
          onClick={apply}
          className="rounded px-3 py-1 text-xs"
          style={{
            background: token('--color-accent'),
            color: token('--color-bg'),
          }}
        >
          Apply YAML
        </button>
      </div>
    </div>
  );
}
