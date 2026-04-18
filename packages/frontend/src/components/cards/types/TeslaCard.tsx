'use client';

import type { TeslaCard as TeslaCardDescriptor, VehicleState } from '@ha/shared';
import {
  Battery, BatteryCharging, Thermometer, Lock, Unlock, ShieldCheck, ShieldOff,
  Plug, MapPin, Gauge, Navigation,
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

  const allSections: Section[] = [
    'battery', 'range', 'climate', 'locks', 'charging', 'sentry',
    'windows', 'trunks', 'location', 'speed', 'seatHeaters', 'defrost', 'software',
  ];
  const sections = card.sections ?? allSections;
  const has = (s: Section) => sections.includes(s);

  const isOnline = device.sleepState === 'online';
  const batteryColor =
    device.batteryLevel <= 10 ? severityVar('critical')
      : device.batteryLevel <= 25 ? severityVar('warning')
      : severityVar('success');

  const showLiveMap = card.imageSource === 'live-map';
  const imageUrl = showLiveMap ? null : buildImageUrl(card, device);

  return (
    <div
      className="flex flex-col overflow-hidden rounded-2xl"
      style={{
        background: token('--color-bg-card'),
        color: token('--color-text'),
        border: `1px solid ${token('--color-border')}`,
        boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
      }}
      data-card-type="tesla"
    >
      {/* Hero — car image or live map */}
      {!card.hideImage && (
        <div className="relative" style={{ background: '#0d0d0d' }}>
          {/* Radial glow behind car */}
          {!showLiveMap && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse 70% 60% at 50% 55%, rgba(255,255,255,0.04) 0%, transparent 70%)',
              }}
            />
          )}

          {/* Header overlaid on hero */}
          <div className="absolute top-0 left-0 right-0 flex items-start justify-between gap-2 px-4 pt-4 z-10">
            <div className="flex flex-col">
              <span className="text-white font-semibold text-base leading-tight drop-shadow-md">{label}</span>
              {(device.paintColor || device.wheelName || device.trimName) && (
                <span className="text-[11px] text-white/50 mt-0.5">
                  {[device.trimName, device.paintColor, device.wheelName].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
            <span
              className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide mt-0.5 shrink-0"
              style={{
                background: isOnline ? 'rgba(52,199,89,0.22)' : 'rgba(255,255,255,0.08)',
                color: isOnline ? '#34c759' : 'rgba(255,255,255,0.45)',
                border: `1px solid ${isOnline ? 'rgba(52,199,89,0.35)' : 'rgba(255,255,255,0.12)'}`,
              }}
            >
              {device.sleepState}
            </span>
          </div>

          {/* Car image */}
          {!showLiveMap && (
            imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt={`${label} render`}
                className="w-full h-auto relative z-0"
                style={{ aspectRatio: '16 / 7', objectFit: 'contain', paddingTop: '52px', paddingBottom: '12px' }}
                loading="lazy"
              />
            ) : (
              <SilhouetteSvg />
            )
          )}

          {/* Live map */}
          {showLiveMap && device.latitude != null && device.longitude != null && (
            <div style={{ paddingTop: '52px' }}>
              <iframe
                title="Vehicle location"
                src={buildMapUrl(device.latitude, device.longitude)}
                className="w-full block border-0"
                style={{ height: '220px' }}
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            </div>
          )}
          {showLiveMap && (device.latitude == null || device.longitude == null) && (
            <div
              className="flex items-center justify-center text-white/30 text-sm"
              style={{ height: '220px', paddingTop: '52px' }}
            >
              <Navigation className="h-4 w-4 mr-2" />
              Location unavailable
            </div>
          )}

          {/* Speed chip overlay */}
          {has('speed') && device.speed != null && device.speed > 0 && (
            <div
              className="absolute bottom-3 left-3 z-10 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
              style={{ background: 'rgba(0,0,0,0.6)', color: '#fff', backdropFilter: 'blur(8px)' }}
            >
              <Gauge className="h-3 w-3" />
              <span className="tabular-nums">{Math.round(device.speed)} mph</span>
              {device.shiftState && <span className="text-white/50">· {device.shiftState}</span>}
            </div>
          )}
        </div>
      )}

      {/* Header when no hero */}
      {card.hideImage && (
        <div className="flex items-center justify-between gap-2 px-4 pt-4">
          <div className="flex flex-col">
            <span className="font-semibold text-sm">{label}</span>
            {(device.paintColor || device.wheelName || device.trimName) && (
              <span className="text-[11px] mt-0.5" style={{ color: token('--color-text-muted') }}>
                {[device.trimName, device.paintColor, device.wheelName].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
          <span
            className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold shrink-0"
            style={{
              background: isOnline ? token('--color-success') : token('--color-bg-hover'),
              color: isOnline ? '#fff' : token('--color-text-muted'),
            }}
          >
            {device.sleepState}
          </span>
        </div>
      )}

      {/* Stats + controls */}
      <div className="flex flex-col gap-3 px-4 py-4">

        {/* Battery bar — prominent */}
        {has('battery') && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                {device.chargeState === 'charging'
                  ? <BatteryCharging className="h-4 w-4" style={{ color: batteryColor }} />
                  : <Battery className="h-4 w-4" style={{ color: batteryColor }} />}
                <span className="font-semibold tabular-nums" style={{ color: batteryColor }}>
                  {device.batteryLevel}%
                </span>
                {has('range') && (
                  <span className="text-xs" style={{ color: token('--color-text-muted') }}>
                    · {Math.round(device.batteryRange)} mi
                  </span>
                )}
              </div>
              {device.chargeState === 'charging' && device.timeToFullCharge > 0 && (
                <span className="text-xs tabular-nums" style={{ color: token('--color-text-muted') }}>
                  {device.timeToFullCharge.toFixed(1)}h to full
                </span>
              )}
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full"
              style={{ background: token('--color-bg-hover') }}
            >
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${device.batteryLevel}%`, background: batteryColor }}
              />
            </div>
          </div>
        )}

        {/* Charging detail */}
        {has('charging') && device.chargeState !== 'disconnected' && (
          <div className="flex items-center gap-2 text-xs" style={{ color: token('--color-text-secondary') }}>
            <Plug className="h-3.5 w-3.5 shrink-0" />
            <span className="tabular-nums">
              {device.chargeState === 'charging'
                ? `+${device.chargeRate.toFixed(0)} mi/hr · ${device.chargerPower.toFixed(1)} kW`
                : device.chargeState === 'complete' ? 'Charge complete' : 'Charger stopped'}
            </span>
          </div>
        )}

        {/* Action chips */}
        {(has('climate') || has('locks') || has('sentry')) && (
          <div className="flex flex-wrap gap-2">
            {has('climate') && (
              <ChipButton
                active={device.climateOn}
                pending={isPending('climate')}
                Icon={Thermometer}
                label={device.climateOn ? `${cToF(device.insideTemp)}` : 'Climate'}
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
                label={device.sentryMode ? 'Sentry' : 'Sentry'}
                onClick={() => send('sentry', {
                  type: 'vehicle',
                  action: 'set_sentry_mode',
                  enabled: !device.sentryMode,
                })}
              />
            )}
          </div>
        )}

        {/* Alerts */}
        {(has('windows') || has('trunks')) && (
          <div className="flex flex-wrap gap-2 text-xs">
            {has('windows') && device.windowsOpen && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5"
                style={{ background: `${severityVar('warning')}22`, color: severityVar('warning') }}
              >
                ⚠ Windows open
              </span>
            )}
            {has('trunks') && device.trunkOpen && (
              <span className="text-xs" style={{ color: token('--color-text-secondary') }}>Trunk open</span>
            )}
            {has('trunks') && device.frunkOpen && (
              <span className="text-xs" style={{ color: token('--color-text-secondary') }}>Frunk open</span>
            )}
          </div>
        )}

        {/* Location */}
        {has('location') && device.latitude != null && device.longitude != null && (
          <div className="flex items-center gap-2 text-xs" style={{ color: token('--color-text-muted') }}>
            <MapPin className="h-3 w-3 shrink-0" />
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

        {/* Footer */}
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

function buildMapUrl(lat: number, lon: number): string {
  const pad = 0.008;
  const bbox = `${lon - pad},${lat - pad},${lon + pad},${lat + pad}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
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
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium disabled:opacity-50 transition-all"
      style={{
        background: active ? token('--color-accent') : token('--color-bg-hover'),
        color: active ? '#fff' : token('--color-text-secondary'),
        border: `1px solid ${active ? token('--color-accent') : token('--color-border')}`,
      }}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

// --- silhouette fallback ---------------------------------------------------

function SilhouetteSvg() {
  return (
    <svg
      viewBox="0 0 400 160"
      role="img"
      aria-label="Vehicle silhouette"
      style={{ width: '100%', height: 'auto', aspectRatio: '16 / 7', paddingTop: '52px', paddingBottom: '12px', display: 'block' }}
    >
      <defs>
        <linearGradient id="body-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.12)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.04)" />
        </linearGradient>
      </defs>
      {/* Body */}
      <path
        d="M 40 115 Q 60 80 110 68 L 155 48 Q 200 32 245 48 L 290 68 Q 340 80 360 115 L 360 128 L 40 128 Z"
        fill="url(#body-grad)"
        stroke="rgba(255,255,255,0.14)"
        strokeWidth="1.5"
      />
      {/* Windshield */}
      <path
        d="M 155 48 Q 172 36 200 33 Q 228 36 245 48 L 230 70 L 170 70 Z"
        fill="rgba(120,180,255,0.08)"
        stroke="rgba(255,255,255,0.1)"
        strokeWidth="1"
      />
      {/* Wheels */}
      <circle cx="108" cy="128" r="20" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
      <circle cx="108" cy="128" r="10" fill="rgba(255,255,255,0.06)" />
      <circle cx="292" cy="128" r="20" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
      <circle cx="292" cy="128" r="10" fill="rgba(255,255,255,0.06)" />
    </svg>
  );
}

function cToF(c: number | null): string {
  if (c == null) return '—°F';
  return `${Math.round((c * 9) / 5 + 32)}°F`;
}
