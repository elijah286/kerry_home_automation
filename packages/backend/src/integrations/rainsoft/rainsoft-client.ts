// ---------------------------------------------------------------------------
// RainSoft Remind cloud API (same endpoints as the mobile app / Homebridge plugin)
// ---------------------------------------------------------------------------

const BASE = 'https://remind.rainsoft.com/api/remindapp/v2';

export interface RainsoftSnapshot {
  displayName: string;
  serialNumber: string;
  prettyModel: string;
  systemStatusName: string;
  capacityRemaining: number;
  saltPct: number;
  lastRegenDate: string | null;
  regenTime: string | null;
}

async function postForm(path: string, body: URLSearchParams, headers: Record<string, string>): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
}

export async function rainsoftLogin(email: string, password: string): Promise<string | null> {
  const res = await postForm(
    '/login',
    new URLSearchParams({ email, password }),
    {
      Accept: 'application/json',
      Origin: 'ionic://localhost',
      'User-Agent': 'HomeAutomation/1.0',
    },
  );
  if (res.status !== 200) return null;
  const data = (await res.json()) as { authentication_token?: string };
  return data.authentication_token ?? null;
}

async function getJson(
  path: string,
  token: string,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'X-Remind-Auth-Token': token,
      Accept: 'application/json',
      Origin: 'ionic://localhost',
      'User-Agent': 'HomeAutomation/1.0',
    },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

export async function discoverDeviceId(email: string, password: string): Promise<string | null> {
  const token = await rainsoftLogin(email, password);
  if (!token) return null;

  const cust = await getJson('/customer', token);
  if (cust.status !== 200 || !cust.data || typeof cust.data !== 'object') return null;
  const customerId = (cust.data as { id?: unknown }).id;
  if (customerId == null) return null;

  const loc = await getJson(`/locations/${customerId}`, token);
  if (loc.status !== 200 || !loc.data || typeof loc.data !== 'object') return null;
  const list = (loc.data as { locationListData?: { devices?: { id: unknown }[] }[] }).locationListData;
  const dev = list?.[0]?.devices?.[0];
  const id = dev?.id;
  return id != null ? String(id) : null;
}

export async function fetchRainsoftSnapshot(
  email: string,
  password: string,
  deviceId: string,
): Promise<RainsoftSnapshot | null> {
  let token = await rainsoftLogin(email, password);
  if (!token) return null;

  let status = await getJson(`/device/${encodeURIComponent(deviceId)}`, token);
  if (status.status === 400) {
    token = await rainsoftLogin(email, password);
    if (!token) return null;
    status = await getJson(`/device/${encodeURIComponent(deviceId)}`, token);
  }

  if (status.status !== 200 || !status.data || typeof status.data !== 'object') return null;

  const data = status.data as Record<string, unknown>;

  let saltPct = 0;
  const saltLbs = data.saltLbs;
  const maxSalt = data.maxSalt;
  if (typeof saltLbs === 'number' && typeof maxSalt === 'number' && maxSalt > 0) {
    saltPct = (saltLbs / maxSalt) * 100;
    saltPct = Math.max(0, Math.min(100, saltPct));
  }

  const baseModel = String(data.model ?? 'RainSoft').trim();
  const sizePart = String(data.unitSizeName ?? '').trim();
  let resinPart = String(data.resinTypeName ?? '').trim();
  if (resinPart.toUpperCase().startsWith('TYPE')) resinPart = resinPart.substring(4).trim();
  const prettyModel = [baseModel, sizePart, resinPart].filter(Boolean).join('-');

  const serialNumber =
    data.serialNumber != null ? String(data.serialNumber) : String(deviceId);

  return {
    displayName: String(data.name ?? data.model ?? 'RainSoft'),
    serialNumber,
    prettyModel,
    systemStatusName: String(data.systemStatusName ?? 'Unknown'),
    capacityRemaining:
      typeof data.capacityRemaining === 'number' ? Math.max(0, Math.min(100, data.capacityRemaining)) : 0,
    saltPct,
    lastRegenDate: data.lastRegenDate != null ? String(data.lastRegenDate) : null,
    regenTime: data.regenTime != null ? String(data.regenTime) : null,
  };
}
