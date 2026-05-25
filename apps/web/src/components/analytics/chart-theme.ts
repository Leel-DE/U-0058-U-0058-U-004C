import type { CSSProperties } from 'react';

export const chartGridStroke = 'hsl(var(--border))';

export const chartAxisTick = {
  fill: 'hsl(var(--muted-foreground))',
  fontSize: 12,
} as const;

export const chartTooltipStyle: CSSProperties = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  boxShadow: '0 18px 45px rgb(0 0 0 / 0.28)',
  color: 'hsl(var(--popover-foreground))',
};

export const chartTooltipLabelStyle: CSSProperties = {
  color: 'hsl(var(--foreground))',
  fontWeight: 600,
};

export const chartTooltipItemStyle: CSSProperties = {
  color: 'hsl(var(--popover-foreground))',
};

export const chartLegendStyle: CSSProperties = {
  color: 'hsl(var(--muted-foreground))',
  fontSize: 12,
};

export const chartCursorStyle = {
  fill: 'hsl(var(--muted))',
  opacity: 0.28,
} as const;
