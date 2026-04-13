import { App } from '@capacitor/app';
import { Device } from '@capacitor/device';
import { Geolocation } from '@capacitor/geolocation';
import { Network } from '@capacitor/network';

export type KioskTelemetry = {
  device: Awaited<ReturnType<typeof Device.getInfo>>;
  network: Awaited<ReturnType<typeof Network.getStatus>>;
  app: { version: string; build: string };
  location: Awaited<ReturnType<typeof Geolocation.getCurrentPosition>> | null;
};

/** Snapshot of device + connectivity; location may be null if permission denied or unavailable. */
export async function collectKioskTelemetry(): Promise<KioskTelemetry> {
  const [device, network, appInfo] = await Promise.all([
    Device.getInfo(),
    Network.getStatus(),
    App.getInfo(),
  ]);

  let location: KioskTelemetry['location'] = null;
  try {
    location = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 15_000,
    });
  } catch {
    /* permission or timeout — kiosk may omit location */
  }

  return {
    device,
    network,
    app: { version: appInfo.version, build: appInfo.build },
    location,
  };
}
