// Workshop design tokens.
// Follows the ui-design skill (Linear/Attio "tool look") with a single brand
// primary colour as the only accent. See skills/ui-design/SKILL.md.
// CUSTOMIZE: swap `colors.primary.*` below to your brand hue.

export const tokens = {
  colors: {
    // Brand — one accent, used sparingly
    brandTeal: '#009E85',
    brandTealDark: '#007A66',
    brandTealTint: '#E0F7F3',

    // Dark canvas (legacy — marketing only)
    canvasDark: '#0D1B2E',

    // Surfaces (light)
    page: '#fafbfb', // canvas — not pure white
    surface: '#ffffff',
    surfaceSubtle: '#f7f8f8', // hover, zebra
    surfaceMuted: '#f3f4f5', // active tab, chip bg

    // Borders — hairlines only
    border: '#e6e8eb',
    borderStrong: '#d0d6e0',
    borderDivider: '#eff0f2',

    // Text ramp — 4 steps, no more
    textPrimary: '#0f1011',
    textSecondary: '#3d4149',
    textTertiary: '#62666d',
    textMuted: '#8a8f98',

    // Legacy aliases (kept for incremental migration)
    ink: '#0F172A',
    slate: '#475569',
    mist: '#94A3B8',
    snow: '#F8FAFC',
    divider: '#E2E8F0',
  },
  radius: {
    xs: '4px', // chips, badges
    sm: '6px', // buttons, inputs
    md: '8px', // cards, panels
    lg: '10px',
    xl: '12px', // modals
    full: '9999px',
  },
  spacing: {
    0.5: '4px',
    1: '8px',
    1.5: '12px',
    2: '16px',
    2.5: '20px',
    3: '24px',
    4: '32px',
  },
  density: {
    // Control heights — dense by default
    chip: '18px',
    controlXs: '24px',
    controlSm: '28px',
    controlMd: '32px',
    rowSm: '36px',
    rowMd: '44px',
    topbar: '44px',
    cellPaddingX: '12px',
    cellPaddingY: '10px',
  },
  typography: {
    // size keys map to the ui-design ramp
    label: '11px', // uppercase meta, tracking 0.04em
    meta: '11px',
    caption: '12px',
    body: '12.5px', // default cell text
    bodyLg: '13px',
    headingXs: '13px',
    headingSm: '16px',
    titleSm: '20px', // page H1 — not 30px
    titleMd: '22px',
    titleLg: '28px',
  },
  shadow: {
    card: 'none',
    popover:
      '0 4px 12px -2px rgba(15,17,17,0.08), 0 0 0 1px rgba(15,17,17,0.05)',
    buttonPrimary: 'inset 0 1px 0 0 rgba(255,255,255,0.12)',
  },
} as const;
