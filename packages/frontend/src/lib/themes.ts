export interface Theme {
  id: string;
  name: string;
  description: string;
  /** Preview swatch colors [primary, secondary, accent] */
  preview: [string, string, string];
  /** CSS variable overrides per color-scheme. Omitted vars inherit from the default theme. */
  variables: {
    light?: Record<string, string>;
    dark?: Record<string, string>;
  };
}

export const themes: Theme[] = [
  {
    id: 'default',
    name: 'Default',
    description: 'Clean, modern look',
    preview: ['#3b82f6', '#0f172a', '#f8fafc'],
    variables: {},
  },
  {
    id: 'lcars',
    name: 'LCARS',
    description: 'Starfleet computer interface',
    preview: ['#ff9900', '#000000', '#cc99cc'],
    variables: {
      light: {
        '--color-bg': '#000000',
        '--color-bg-secondary': '#1a1a2e',
        '--color-bg-card': '#0a0a1a',
        '--color-bg-hover': '#1a1a2e',
        '--color-text': '#ff9900',
        '--color-text-secondary': '#cc99cc',
        '--color-text-muted': '#9977aa',
        '--color-border': '#cc6699',
        '--color-border-hover': '#ff9900',

        '--color-sidebar-bg': '#000000',
        '--color-sidebar-text': '#cc99cc',
        '--color-sidebar-text-active': '#ff9900',
        '--color-sidebar-active-bg': '#1a1a2e',
        '--color-sidebar-hover': '#0a0a1a',

        '--color-accent': '#ff9900',
        '--color-accent-hover': '#ffaa22',
        '--color-success': '#99cc66',
        '--color-warning': '#ff9966',
        '--color-danger': '#cc6666',

        '--color-table-header': '#0a0a1a',
        '--color-table-row-hover': '#1a1a2e',
        '--color-table-stripe': '#050510',

        '--color-slider-track': '#1a1a2e',
        '--color-slider-range': '#ff9900',
        '--color-slider-thumb': '#ff9900',

        '--radius': '16px',
        '--radius-sm': '8px',
        '--radius-lg': '24px',
      },
      dark: {
        '--color-bg': '#000000',
        '--color-bg-secondary': '#1a1a2e',
        '--color-bg-card': '#0a0a1a',
        '--color-bg-hover': '#1a1a2e',
        '--color-text': '#ff9900',
        '--color-text-secondary': '#cc99cc',
        '--color-text-muted': '#9977aa',
        '--color-border': '#cc6699',
        '--color-border-hover': '#ff9900',

        '--color-sidebar-bg': '#000000',
        '--color-sidebar-text': '#cc99cc',
        '--color-sidebar-text-active': '#ff9900',
        '--color-sidebar-active-bg': '#1a1a2e',
        '--color-sidebar-hover': '#0a0a1a',

        '--color-accent': '#ff9900',
        '--color-accent-hover': '#ffaa22',
        '--color-success': '#99cc66',
        '--color-warning': '#ff9966',
        '--color-danger': '#cc6666',

        '--color-table-header': '#0a0a1a',
        '--color-table-row-hover': '#1a1a2e',
        '--color-table-stripe': '#050510',

        '--color-slider-track': '#1a1a2e',
        '--color-slider-range': '#ff9900',
        '--color-slider-thumb': '#ff9900',

        '--radius': '16px',
        '--radius-sm': '8px',
        '--radius-lg': '24px',
      },
    },
  },
];

export function getThemeById(id: string): Theme | undefined {
  return themes.find((t) => t.id === id);
}
