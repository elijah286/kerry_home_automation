'use client';

// ---------------------------------------------------------------------------
// TeslaCard — rich vehicle tile with compositor backdrop.
//
// Builds the Tesla configurator compositor URL from `optionCodes` +
// `compositorModel` that the backend parsed out of `vehicle_config`. The
// image renders underneath an overlay of live control chips (battery,
// climate, lock, sentry, charging, trunks/frunks). If compositor inputs are
// missing or the user picks `silhouette`, we fall back to a themed SVG.
//
// Chips are cheap: they render from already-live VehicleState fields. The
// only command paths surfaced here are the high-value ones — lock, climate,
// sentry. Full controls still live on the VehicleControl detail page.
// ---------------------------------------------------------------------------

import type { TeslaCard as TeslaCardDescriptor, VehicleState } from '@ha/shared';
import {
  Battery, BatteryCharging, Thermometer, Lock, Unlock, ShieldCheck, ShieldOff,
  Plug, MapPin, Gauge, Car,
} from 'lucide-react';
import { useDevice } from '@/hooks/useDevice';
import { useCommand } from '@/hooks/useCommand';
import { token, severityVar } from '@/lib/tokens';
import { withEntityBoundary } from '../EntityBoundary';

const COMPOSITOR_BASE = 'https://static-assets.tesla.com/configurator/compositor';

type Section = NonNullable<TeslaCardDescriptor['sections']>[number];

export function TeslaCard({ card }: { card: TeslaCardDescriptor }) {
  const device = useDevice(card.entity);
  return withEntityBoundary(
    card.entity,
    device,
    (d) => {
      if (d.type !== 'vehicle') return <div />;
      return <TeslaBody card={card} device={d} />;
    },
    { title: card.name },
  );
}

function TeslaBody({ card, device }: { card: TeslaCardDescriptor; device: VehicleState }) {
  const { send, isPending } = useCommand(device.id);
  const label = card.name ?? device.displayName ?? device.name;

  const imageUrl = buildImageUrl(card, device);
  const allSections: Section[] = [
    'battery', 'range', 'climate', 'locks', 'charging', 'sentry',
    'windows', 'trunks', 'location', 'speed', 'seatHeaters', 'defrost', 'software',
  ];
  const sections = card.sections ?? allSections;
  const has = (s: Section) => sections.includes(s);

  const batteryColor =
    device.batteryLevel <= 10 ? severityVar('critical')
      : device.batteryLevel <= 25 ? severityVar('warning')
      : severityVar('success');

  return (
    <div
      className="flex flex-col gap-2 overflow-hidden rounded-lg"
      style={{
        background: token('--color-bg-card'),
        color: token('--color-text'),
        border: `1px solid ${token('--color-border')}`,
      }}
      data-card-type="tesla"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <div className="flex flex-col">
          <span className="truncate text-sm font-medium">{label}</span>
          {(device.paintColor || device.wheelName || device.trimName) && (
            <span className="truncate text-[11px]" style={{ color: token('--color-text-muted') }}>
              {[device.trimName, device.paintColor, device.wheelName].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>
        <span
          className="rounded-md px-1.5 py-0.5 text-[10px] font-medium"
          style={{
            background: device.sleepState === 'online' ? token('--color-success') : token('--color-bg-hover'),
            color: device.sleepState === 'online' ? '#fff' : token('--color-text-muted'),
          }}
          title={`Vehicle is ${device.sleepState}`}
        >
          {device.sleepState}
        </span>
      </div>

      {/* Vehicle image */}
      {!card.hideImage && (
        <div className="relative" style={{ background: token('--color-bg-hover') }}>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={`${label} render`}
              className="h-auto w-full"
              style={{ aspectRatio: '16 / 9', objectFit: 'contain' }}
              loading="lazy"
            />
          ) : (
            <SilhouetteSvg />
          )}
          {/* Speed chip overlay while driving */}
          {has('speed') && device.speed != null && device.speed > 0 && (
            <div
              className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium"
              style={{ background: token('--color-bg'), color: token('--color-text'), opacity: 0.92 }}
            >
              <Gauge className="h-3 w-3" />
              <span className="tabular-nums">{Math.round(device.speed)} mph</span>
              {device.shiftState && <span>· {device.shiftState}</span>}
            </div>
          )}
        </div>
      )}

      {/* Control rows */}
      <div className="flex flex-col gap-2 px-3 pb-3">
        {has('battery') && (
          <div className="flex items-center gap-2 text-xs">
            {device.chargeState === 'charging'
              ? <BatteryCharging className="h-4 w-4" style={{ color: batteryColor }} />
              : <Battery className="h-4 w-4" style={{ color: batteryColor }} />}
            <span className="tabular-nums font-medium">{device.batteryLevel}%</span>
            {has('range') && (
              <span style={{ color: token('--color-text-muted') }}>
                · {Math.round(device.batteryRange)} mi
              </span>
            )}
            <div
              className="ml-2 h-1.5 flex-1 overflow-hidden rounded-full"
              style={{ background: token('--color-bg-hover') }}
            >
              <div
                className="h-full"
                style={{ width: `${device.batteryLevel}%`, background: batteryColor }}
              />
            </div>
          </div>
        )}

        {(has('climate') || has('locks') || has('sentry')) && (
          <div className="flex flex-wrap gap-1.5">
            {has('climate') && (
              <ChipButton
                active={device.climateOn}
                pending={isPending('climate')}
                Icon={Thermometer}
                label={device.climateOn ? `${cToF(device.insideTemp)} inside` : 'Climate off'}
                onClick={() => send('climate', {
                  type: 'vehicle',
                  action: device.climateOn ? 'climate_stop' : 'climate_start',
                })}
              />
            )}
            {has('locks') && (
              <ChipButton
                active={!device.locked}
                pending={isPending('lock')}
                Icon={device.locked ? Lock : Unlock}
                label={device.locked ? 'Locked' : 'Unlocked'}
                onClick={() => send('lock', {
                  type: 'vehicle',
                  action: device.locked ? 'door_unlock' : 'door_lock',
                })}
              />
            )}
            {has('sentry') && (
              <ChipButton
                active={device.sentryMode}
                pending={isPending('sentry')}
                Icon={device.sentryMode ? ShieldCheck : ShieldOff}
                label={device.sentryMode ? 'Sentry' : 'Sentry off'}
                onClick={() => send('sentry', {
                  type: 'vehicle',
                  action: 'set_sentry_mode',
                  enabled: !device.sentryMode,
                })}
              />
            )}
          </div>
        )}

        {has('charging') && device.chargeState !== 'disconnected' && (
          <div className="flex items-center gap-2 text-xs" style={{ color: token('--color-text-secondary') }}>
            <Plug className="h-3.5 w-3.5" />
            <span className="tabular-nums">
              {device.chargeState === 'charging'
                ? `+${device.chargeRate.toFixed(0)} mi/hr · ${device.chargerPower.toFixed(1)} kW`
                : device.chargeState === 'complete' ? 'Charge complete' : 'Charger stopped'}
            </span>
            {device.timeToFullCharge > 0 && (
              <span style={{ color: token('--color-text-muted') }}>
                · {device.timeToFullCharge.toFixed(1)}h to full
              </span>
            )}
          </div>
        )}

        {(has('windows') || has('trunks')) && (
          <div className="flex flex-wrap gap-2 text-xs" style={{ color: token('--color-text-secondary') }}>
            {has('windows') && device.windowsOpen && (
              <span style={{ color: severityVar('warning') }}>⚠ Windows open</span>
            )}
            {has('trunks') && device.trunkOpen && <span>Trunk open</span>}
            {has('trunks') && device.frunkOpen && <span>Frunk open</span>}
          </div>
        )}

        {has('location') && device.latitude != null && device.longitude != null && (
          <div className="flex items-center gap-2 text-xs" style={{ color: token('--color-text-muted') }}>
            <MapPin className="h-3 w-3" />
            <span className="tabular-nums">
              {device.latitude.toFixed(3)}, {device.longitude.toFixed(3)}
            </span>
            {card.showMap && (
              <a
                href={`https://www.google.com/maps?q=${device.latitude},${device.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                map
              </a>
            )}
          </div>
        )}

        {has('software') && device.softwareVersion && (
          <div className="text-[10px]" style={{ color: token('--color-text-muted') }}>
            Software {device.softwareVersion}
            {device.odometer > 0 && ` · ${Math.round(device.odometer).toLocaleString()} mi`}
          </div>
        )}
      </div>
    </div>
  );
}

// --- image url -------------------------------------------------------------

function buildImageUrl(card: TeslaCardDescriptor, device: VehicleState): string | null {
  const canCompositor = !!(device.compositorModel && device.optionCodes);
  const want =
    card.imageSource === 'silhouette' ? 'silhouette'
      : card.imageSource === 'compositor' ? 'compositor'
      : canCompositor ? 'compositor' : 'silhouette';

  if (want !== 'compositor' || !canCompositor) return null;

  const params = new URLSearchParams({
    model: device.compositorModel as string,
    view: card.imageView,
    size: String(card.imageSize),
    options: device.optionCodes as string,
    bkba_opt: '1',
    crop: '0,0,0,0',
  });
  return `${COMPOSITOR_BASE}?${params.toString()}`;
}

// --- chip button -----------------------------------------------------------

function ChipButton({
  active, pending, Icon, label, onClick,
}: {
  active: boolean;
  pending: boolean;
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium disabled:opacity-60"
      style={{
        background: active ? token('--color-accent') : token('--color-bg-hover'),
        color: active ? '#fff' : token('--color-text-secondary'),
        transition: 'background 0.2s',
      }}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

// --- silhouette fallback ---------------------------------------------------

function SilhouetteSvg() {
  return (
    <svg viewBox="0 0 320 120" role="img" aria-label="Vehicle silhouette" style={{ width: '100%', height: 'auto', aspectRatio: '16 / 9' }}>
      <path
        d="M 20 90 Q 40 60 80 55 L 120 35 Q 160 25 200 35 L 240 55 Q 280 60 300 90 L 300 100 L 20 100 Z"
        fill={token('--color-bg-card')}
        stroke={token('--color-border')}
        strokeWidth="2"
      />
      <circle cx="80" cy="100" r="14" fill={token('--color-bg')} stroke={token('--color-border')} strokeWidth="2" />
      <circle cx="240" cy="100" r="14" fill={token('--color-bg')} stroke={token('--color-border')} strokeWidth="2" />
      <Car className="hidden" />
    </svg>
  );
}

function cToF(c: number | null): string {
  if (c == null) return '—°F';
  return `${Math.round((c * 9) / 5 + 32)}°F`;
}
