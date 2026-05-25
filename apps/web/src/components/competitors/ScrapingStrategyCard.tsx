import { Bot, Gauge, ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { StoreAnalysisResult } from '@cr/shared';
import { Badge } from '@/components/ui/badge';

function difficultyVariant(value: string) {
  if (value === 'low') return 'success' as const;
  if (value === 'medium') return 'warning' as const;
  return 'destructive' as const;
}

function modeLabel(mode: string) {
  const labels: Record<string, string> = {
    cheerio: 'Cheerio only',
    playwright_fallback: 'Cheerio + Playwright fallback',
    playwright_primary: 'Playwright primary',
    hybrid: 'Hybrid mode',
  };
  return labels[mode] ?? mode;
}

export function ScrapingStrategyCard({ analysis }: { analysis: StoreAnalysisResult }) {
  return (
    <div className="rounded-md border p-4">
      <div className="mb-3 flex items-center gap-2">
        <Bot className="h-4 w-4" />
        <div className="text-sm font-medium">Recommended scraping strategy</div>
      </div>
      <div className="text-lg font-semibold">{modeLabel(analysis.scrapingMode)}</div>
      <p className="mt-1 text-sm text-muted-foreground">{analysis.renderingStrategy.explanation}</p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Metric
          icon={<Gauge className="h-4 w-4" />}
          label="Crawl difficulty"
          value={analysis.scrapingProfile.crawlDifficulty}
          variant={difficultyVariant(analysis.scrapingProfile.crawlDifficulty)}
        />
        <Metric
          icon={<ShieldAlert className="h-4 w-4" />}
          label="Anti-bot risk"
          value={analysis.scrapingProfile.antiBotRisk}
          variant={difficultyVariant(analysis.scrapingProfile.antiBotRisk)}
        />
        <Metric
          icon={<Gauge className="h-4 w-4" />}
          label="Expected stability"
          value={analysis.scrapingProfile.expectedScrapeStability}
          variant={difficultyVariant(analysis.scrapingProfile.expectedScrapeStability === 'high' ? 'low' : analysis.scrapingProfile.expectedScrapeStability)}
        />
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  variant,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  variant: 'success' | 'warning' | 'destructive';
}) {
  return (
    <div className="rounded-md bg-muted/40 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <Badge className="mt-2 capitalize" variant={variant}>{value}</Badge>
    </div>
  );
}
