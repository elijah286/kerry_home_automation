'use client';

// ---------------------------------------------------------------------------
// CardRenderer — renders one CardDescriptor by dispatching on `card.type`.
//
// This is the single switch every dashboard (hand-coded or LLM-composed) goes
// through. A missing card type falls back to a muted "unknown" tile so a typo
// in dashboard YAML never takes the whole page down.
//
// New card types: add the import and the case. The exhaustiveness assertion
// at the end ensures TypeScript flags any CardDescriptor variant that lacks a
// renderer.
// ---------------------------------------------------------------------------

import type { CardDescriptor } from '@ha/shared';
import { memo } from 'react';

import { HeadingCard } from './types/HeadingCard';
import { MarkdownCard } from './types/MarkdownCard';
import { ButtonCard } from './types/ButtonCard';
import { LightTileCard } from './types/LightTileCard';
import { SwitchTileCard } from './types/SwitchTileCard';
import { CoverTileCard } from './types/CoverTileCard';
import { FanTileCard } from './types/FanTileCard';
import { LockTileCard } from './types/LockTileCard';
import { ThermostatCard } from './types/ThermostatCard';
import { MediaTileCard } from './types/MediaTileCard';
import { VehicleCard } from './types/VehicleCard';
import { SensorValueCard } from './types/SensorValueCard';
import { GaugeCard } from './types/GaugeCard';
import { StatisticCard } from './types/StatisticCard';
import { HistoryGraphCard } from './types/HistoryGraphCard';
import { EntityListCard } from './types/EntityListCard';
import { AlertBannerCard } from './types/AlertBannerCard';
import { NotificationInboxCard } from './types/NotificationInboxCard';
import { CameraCard } from './types/CameraCard';
import { MapCard } from './types/MapCard';
import { AreaSummaryCard } from './types/AreaSummaryCard';
import { AlarmPanelCard } from './types/AlarmPanelCard';
import { GroupCard } from './types/GroupCard';
import { IframeSandboxCard } from './types/IframeSandboxCard';
import { VerticalStackCard, HorizontalStackCard } from './types/StackCard';
import { ConditionalCard } from './types/ConditionalCard';
import { UnknownCard } from './types/UnknownCard';

function CardRendererInner({ card }: { card: CardDescriptor }) {
  switch (card.type) {
    case 'heading':            return <HeadingCard card={card} />;
    case 'markdown':           return <MarkdownCard card={card} />;
    case 'button':             return <ButtonCard card={card} />;
    case 'light-tile':         return <LightTileCard card={card} />;
    case 'switch-tile':        return <SwitchTileCard card={card} />;
    case 'cover-tile':         return <CoverTileCard card={card} />;
    case 'fan-tile':           return <FanTileCard card={card} />;
    case 'lock-tile':          return <LockTileCard card={card} />;
    case 'thermostat':         return <ThermostatCard card={card} />;
    case 'media-tile':         return <MediaTileCard card={card} />;
    case 'vehicle':            return <VehicleCard card={card} />;
    case 'sensor-value':       return <SensorValueCard card={card} />;
    case 'gauge':              return <GaugeCard card={card} />;
    case 'statistic':          return <StatisticCard card={card} />;
    case 'history-graph':      return <HistoryGraphCard card={card} />;
    case 'entity-list':        return <EntityListCard card={card} />;
    case 'alert-banner':       return <AlertBannerCard card={card} />;
    case 'notification-inbox': return <NotificationInboxCard card={card} />;
    case 'camera':             return <CameraCard card={card} />;
    case 'map':                return <MapCard card={card} />;
    case 'area-summary':       return <AreaSummaryCard card={card} />;
    case 'alarm-panel':        return <AlarmPanelCard card={card} />;
    case 'group':              return <GroupCard card={card} />;
    case 'iframe-sandbox':     return <IframeSandboxCard card={card} />;
    case 'vertical-stack':     return <VerticalStackCard card={card} />;
    case 'horizontal-stack':   return <HorizontalStackCard card={card} />;
    case 'conditional':        return <ConditionalCard card={card} />;

    default: {
      // Exhaustiveness: force the union to be fully handled. If a new card
      // type lands without a case here, TypeScript errors on this line.
      const _exhaustive: never = card;
      void _exhaustive;
      return <UnknownCard type={(card as { type?: string }).type ?? 'unknown'} reason="unknown-type" />;
    }
  }
}

export const CardRenderer = memo(CardRendererInner);
