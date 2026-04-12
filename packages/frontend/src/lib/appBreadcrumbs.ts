/**
 * Route → human labels for the app header breadcrumb trail.
 * Extend PATH_LABELS when adding top-level or nested routes.
 */

const PATH_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/areas': 'Areas',
  '/alarms': 'Alarms',
  '/bridge': 'Bridge',
  '/calendar': 'Calendar',
  '/cameras': 'Cameras',
  '/devices': 'Devices',
  '/engineering': 'Engineering',
  '/integrations': 'Integrations',
  '/locations': 'Locations',
  '/recipes': 'Recipes',
  '/star-chart': 'Star chart',
  '/tactical': 'Tactical',
  '/settings': 'Settings',
  '/settings/account': 'Account',
  '/settings/appearance': 'Appearance',
  '/settings/system': 'System',
  '/settings/users': 'Users',
  '/settings/helpers': 'Helpers',
  '/settings/history': 'History',
  '/settings/location': 'Location',
  '/settings/llm': 'LLM',
  '/settings/server-installer': 'Server installer',
  '/settings/automations': 'Automations',
  '/settings/automations/editor': 'Editor',
};

function titleCaseSegment(segment: string): string {
  return segment
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** Heuristic: dynamic route param (id slug), not a known static segment */
function isLikelyDynamicId(segment: string): boolean {
  if (/^\d+$/.test(segment)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return true;
  if (segment.length >= 16 && /^[a-z0-9_-]+$/i.test(segment)) return true;
  return false;
}

function labelForPath(fullPath: string, segment: string, parentPath: string): string {
  if (PATH_LABELS[fullPath]) return PATH_LABELS[fullPath];
  if (isLikelyDynamicId(segment)) {
    if (parentPath === '/devices') return 'Device';
    if (parentPath === '/integrations') return 'Integration';
    if (parentPath === '/settings/automations') return 'Automation';
    return 'Details';
  }
  return titleCaseSegment(segment);
}

export type BreadcrumbItem = {
  href: string;
  label: string;
  current: boolean;
};

/**
 * Breadcrumb trail for the authenticated app. Root is a single current-page crumb.
 */
export function getBreadcrumbItems(pathname: string): BreadcrumbItem[] {
  const raw = pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  if (raw === '' || raw === '/') {
    return [{ href: '/', label: PATH_LABELS['/'] ?? 'Dashboard', current: true }];
  }

  const parts = raw.split('/').filter(Boolean);
  const items: BreadcrumbItem[] = [{ href: '/', label: PATH_LABELS['/'] ?? 'Dashboard', current: false }];

  let acc = '';
  for (let i = 0; i < parts.length; i++) {
    const parentPath = acc === '' ? '/' : acc;
    acc += `/${parts[i]}`;
    const isLast = i === parts.length - 1;
    const label = labelForPath(acc, parts[i], parentPath);
    items.push({
      href: acc,
      label,
      current: isLast,
    });
  }

  return items;
}
