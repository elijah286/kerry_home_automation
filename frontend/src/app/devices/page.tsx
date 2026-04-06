"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Cpu,
  Search,
  X,
  Loader2,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { useWebSocket } from "@/providers/WebSocketProvider";
import { fetchDevices } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Device, EntityState } from "@/types";

type SortField =
  | "name"
  | "type"
  | "state"
  | "connectivity"
  | "vendor"
  | "protocol"
  | "last_update"
  | "last_connected"
  | "first_connected";

type SortDir = "asc" | "desc";

interface DeviceRow {
  device: Device;
  type: string;
  state: string;
  connectivity: "online" | "offline" | "disabled" | "unknown";
  name: string;
  vendor: string;
  protocol: string;
  lastUpdate: string;
  lastUpdateTs: number;
  lastConnected: string;
  lastConnectedTs: number;
  firstConnected: string;
  firstConnectedTs: number;
  properties: Record<string, unknown>;
}

function deriveRows(
  devices: Device[],
  entityStates: ReadonlyMap<string, EntityState>,
): DeviceRow[] {
  return devices.map((d) => {
    const entityState = d.entity_ids.length > 0
      ? entityStates.get(d.entity_ids[0])
      : undefined;

    const domain = entityState?.domain ?? d.entity_ids[0]?.split(".")[0] ?? "unknown";
    const state = entityState?.state ?? (d.disabled ? "disabled" : "unknown");

    let connectivity: DeviceRow["connectivity"] = "unknown";
    if (d.disabled) {
      connectivity = "disabled";
    } else if (entityState) {
      const lastChanged = entityState.last_changed ?? 0;
      const staleThreshold = Date.now() - 1000 * 60 * 30; // 30 min
      connectivity = lastChanged > staleThreshold ? "online" : "offline";
    }

    const lastUpdateTs = entityState?.last_updated ?? new Date(d.updated_at).getTime();
    const lastConnectedTs = entityState?.last_changed ?? 0;
    const firstConnectedTs = new Date(d.created_at).getTime();

    const properties: Record<string, unknown> = {
      model: d.model,
      area_id: d.area_id,
      entity_count: d.entity_ids.length,
      ...(typeof d.connection === "object" && d.connection !== null ? d.connection : {}),
    };
    if (entityState?.attributes) {
      const { friendly_name, ...rest } = entityState.attributes;
      Object.assign(properties, rest);
    }

    return {
      device: d,
      type: domain,
      state,
      connectivity,
      name: d.name,
      vendor: d.manufacturer ?? "Unknown",
      protocol: d.protocol,
      lastUpdate: lastUpdateTs ? new Date(lastUpdateTs).toLocaleString() : "—",
      lastUpdateTs,
      lastConnected: lastConnectedTs ? new Date(lastConnectedTs).toLocaleString() : "—",
      lastConnectedTs,
      firstConnected: firstConnectedTs ? new Date(firstConnectedTs).toLocaleString() : "—",
      firstConnectedTs,
      properties,
    };
  });
}

function ConnectivityBadge({ status }: { status: DeviceRow["connectivity"] }) {
  switch (status) {
    case "online":
      return (
        <Badge variant="success" size="sm">
          <Wifi className="mr-1 size-3" />
          Online
        </Badge>
      );
    case "offline":
      return (
        <Badge variant="danger" size="sm">
          <WifiOff className="mr-1 size-3" />
          Offline
        </Badge>
      );
    case "disabled":
      return (
        <Badge variant="default" size="sm">
          Disabled
        </Badge>
      );
    default:
      return (
        <Badge variant="warning" size="sm">
          Unknown
        </Badge>
      );
  }
}

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (field !== sortField) return <ChevronsUpDown className="size-3 text-zinc-600" />;
  return sortDir === "asc"
    ? <ChevronUp className="size-3 text-accent" />
    : <ChevronDown className="size-3 text-accent" />;
}

function PropertyPills({ properties }: { properties: Record<string, unknown> }) {
  const entries = Object.entries(properties).filter(
    ([, v]) => v !== null && v !== undefined && v !== "" && v !== 0,
  );
  if (entries.length === 0) return <span className="text-zinc-600">—</span>;

  return (
    <div className="flex flex-wrap gap-1">
      {entries.slice(0, 4).map(([k, v]) => (
        <span
          key={k}
          className="inline-block max-w-[200px] truncate rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-400"
          title={`${k}: ${String(v)}`}
        >
          <span className="text-zinc-600">{k}:</span> {String(v)}
        </span>
      ))}
      {entries.length > 4 && (
        <span className="text-[10px] text-zinc-600">+{entries.length - 4} more</span>
      )}
    </div>
  );
}

const COLUMNS: { key: SortField; label: string; className?: string }[] = [
  { key: "name", label: "Name", className: "min-w-[180px]" },
  { key: "type", label: "Type" },
  { key: "state", label: "State" },
  { key: "connectivity", label: "Status" },
  { key: "vendor", label: "Vendor" },
  { key: "protocol", label: "Protocol" },
  { key: "last_update", label: "Last Update", className: "min-w-[150px]" },
  { key: "last_connected", label: "Last Connected", className: "min-w-[150px]" },
  { key: "first_connected", label: "First Connected", className: "min-w-[150px]" },
];

export default function DevicesPage() {
  const { entityStates, connected } = useWebSocket();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [protocolFilter, setProtocolFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [connectivityFilter, setConnectivityFilter] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchDevices()
      .then((res) => {
        if (!cancelled) setDevices(res.devices);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load devices");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => deriveRows(devices, entityStates), [devices, entityStates]);

  const protocols = useMemo(() => [...new Set(rows.map((r) => r.protocol))].sort(), [rows]);
  const types = useMemo(() => [...new Set(rows.map((r) => r.type))].sort(), [rows]);

  const filtered = useMemo(() => {
    let list = rows;

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.vendor.toLowerCase().includes(q) ||
          r.type.toLowerCase().includes(q) ||
          r.protocol.toLowerCase().includes(q) ||
          r.state.toLowerCase().includes(q) ||
          r.device.id.toLowerCase().includes(q) ||
          r.device.entity_ids.some((eid) => eid.toLowerCase().includes(q)),
      );
    }

    if (protocolFilter) list = list.filter((r) => r.protocol === protocolFilter);
    if (typeFilter) list = list.filter((r) => r.type === typeFilter);
    if (connectivityFilter) list = list.filter((r) => r.connectivity === connectivityFilter);

    list = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "type":
          cmp = a.type.localeCompare(b.type);
          break;
        case "state":
          cmp = a.state.localeCompare(b.state);
          break;
        case "connectivity":
          cmp = a.connectivity.localeCompare(b.connectivity);
          break;
        case "vendor":
          cmp = a.vendor.localeCompare(b.vendor);
          break;
        case "protocol":
          cmp = a.protocol.localeCompare(b.protocol);
          break;
        case "last_update":
          cmp = a.lastUpdateTs - b.lastUpdateTs;
          break;
        case "last_connected":
          cmp = a.lastConnectedTs - b.lastConnectedTs;
          break;
        case "first_connected":
          cmp = a.firstConnectedTs - b.firstConnectedTs;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [rows, search, sortField, sortDir, protocolFilter, typeFilter, connectivityFilter]);

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDir("asc");
      }
    },
    [sortField],
  );

  const clearFilters = () => {
    setSearch("");
    setProtocolFilter(null);
    setTypeFilter(null);
    setConnectivityFilter(null);
  };

  const hasFilters = !!(search || protocolFilter || typeFilter || connectivityFilter);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-accent" />
          <p className="text-sm text-muted">Loading devices...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-[1600px] p-4 lg:p-6">
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <Cpu className="mx-auto size-10 text-red-400 mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">
            Failed to load devices
          </p>
          <p className="text-xs text-muted mb-4">{error}</p>
          <button
            onClick={() => {
              setLoading(true);
              setError(null);
              fetchDevices()
                .then((res) => setDevices(res.devices))
                .catch((err) =>
                  setError(err instanceof Error ? err.message : "Failed"),
                )
                .finally(() => setLoading(false));
            }}
            className="rounded-lg bg-accent/15 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/25 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1920px] space-y-4 p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-accent/15">
            <Cpu className="size-5 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Devices</h1>
            <p className="text-sm text-muted">
              {devices.length} device{devices.length !== 1 && "s"}
              {!connected && " · Disconnected"}
            </p>
          </div>
        </div>
        <Badge variant={connected ? "success" : "danger"}>
          {connected ? "Live" : "Offline"}
        </Badge>
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[280px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search devices by name, vendor, entity ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-border bg-white/[0.03] py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-zinc-600 outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <select
          value={protocolFilter ?? ""}
          onChange={(e) => setProtocolFilter(e.target.value || null)}
          className="rounded-xl border border-border bg-white/[0.03] px-3 py-2.5 text-sm text-zinc-300 outline-none focus:border-accent/40"
        >
          <option value="">All Protocols</option>
          {protocols.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <select
          value={typeFilter ?? ""}
          onChange={(e) => setTypeFilter(e.target.value || null)}
          className="rounded-xl border border-border bg-white/[0.03] px-3 py-2.5 text-sm text-zinc-300 outline-none focus:border-accent/40"
        >
          <option value="">All Types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          value={connectivityFilter ?? ""}
          onChange={(e) => setConnectivityFilter(e.target.value || null)}
          className="rounded-xl border border-border bg-white/[0.03] px-3 py-2.5 text-sm text-zinc-300 outline-none focus:border-accent/40"
        >
          <option value="">All Status</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="disabled">Disabled</option>
          <option value="unknown">Unknown</option>
        </select>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 rounded-xl border border-border bg-white/[0.03] px-3 py-2.5 text-sm text-muted hover:text-foreground transition-colors"
          >
            <X className="size-3" />
            Clear
          </button>
        )}
      </div>

      {/* Results summary */}
      {hasFilters && (
        <p className="text-xs text-muted">
          Showing {filtered.length} of {devices.length} devices
        </p>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-white/[0.02]">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted cursor-pointer select-none hover:text-foreground transition-colors",
                    col.className,
                  )}
                  onClick={() => handleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    <SortIcon field={col.key} sortField={sortField} sortDir={sortDir} />
                  </span>
                </th>
              ))}
              <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">
                Properties
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNS.length + 1}
                  className="px-4 py-12 text-center text-sm text-muted"
                >
                  {hasFilters
                    ? "No devices match the current filters"
                    : "No devices found"}
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr
                  key={row.device.id}
                  className="border-b border-border/50 transition-colors hover:bg-white/[0.02]"
                >
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-foreground">{row.name}</p>
                      <p className="text-[10px] text-zinc-600 font-mono truncate max-w-[200px]">
                        {row.device.id}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="info" size="sm">
                      {row.type}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "text-sm",
                        row.state === "on"
                          ? "text-green-400"
                          : row.state === "off"
                            ? "text-zinc-500"
                            : row.state === "unavailable"
                              ? "text-red-400"
                              : "text-zinc-400",
                      )}
                    >
                      {row.state}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <ConnectivityBadge status={row.connectivity} />
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{row.vendor}</td>
                  <td className="px-4 py-3">
                    <Badge variant="default" size="sm">
                      {row.protocol}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400 font-mono whitespace-nowrap">
                    {row.lastUpdate}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400 font-mono whitespace-nowrap">
                    {row.lastConnected}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400 font-mono whitespace-nowrap">
                    {row.firstConnected}
                  </td>
                  <td className="px-4 py-3">
                    <PropertyPills properties={row.properties} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
