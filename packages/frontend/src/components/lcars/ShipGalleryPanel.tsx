'use client';

import { SlidePanel } from '@/components/ui/SlidePanel';
import { SHIP_REGISTRY, type ShipEntry } from './Engineering3DPanel';
import { useLCARSVariant } from './LCARSVariantProvider';

export function ShipGalleryPanel({
  open,
  onClose,
  currentShip,
  onSelectShip,
}: {
  open: boolean;
  onClose: () => void;
  currentShip: ShipEntry | null;
  onSelectShip: (ship: ShipEntry) => void;
}) {
  const { colors } = useLCARSVariant();

  return (
    <SlidePanel open={open} onClose={onClose} title="Vessel Registry" size="md">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {SHIP_REGISTRY.map((ship) => {
          const isActive = currentShip?.id === ship.id;
          return (
            <button
              key={ship.id}
              type="button"
              className="lcars-btn"
              style={{
                background: isActive ? colors.navActive : colors.muted,
                color: '#000',
                padding: '12px 16px',
                textAlign: 'left',
                justifyContent: 'flex-start',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 2,
                width: '100%',
              }}
              onClick={() => onSelectShip(ship)}
            >
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em' }}>
                {ship.name}
              </span>
              <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.6, letterSpacing: '0.1em' }}>
                {ship.class}
              </span>
              {isActive && (
                <span style={{ fontSize: 9, fontWeight: 700, opacity: 0.8, marginTop: 2, letterSpacing: '0.12em' }}>
                  CURRENTLY ACTIVE
                </span>
              )}
            </button>
          );
        })}
      </div>
    </SlidePanel>
  );
}
