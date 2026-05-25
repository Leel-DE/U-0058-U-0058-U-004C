'use client';

import type { StoreAnalysisResult, StoreScrapingMode } from '@cr/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

type Settings = StoreAnalysisResult['recommendedSettings'];

const PRESETS = [
  { value: 'safe', label: 'Safe' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'fast', label: 'Fast' },
  { value: 'heavy_discovery', label: 'Heavy discovery' },
] as const;

const MODES: Array<{ value: StoreScrapingMode; label: string }> = [
  { value: 'cheerio', label: 'Cheerio only' },
  { value: 'playwright_fallback', label: 'Cheerio + Playwright fallback' },
  { value: 'playwright_primary', label: 'Playwright primary' },
  { value: 'hybrid', label: 'Hybrid mode' },
];

export function AdvancedScrapingSettings({
  settings,
  onSettingsChange,
  notes,
  onNotesChange,
  scrapingMode,
  onScrapingModeChange,
}: {
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  scrapingMode: StoreScrapingMode;
  onScrapingModeChange: (mode: StoreScrapingMode) => void;
}) {
  const patch = (partial: Partial<Settings>) => onSettingsChange({ ...settings, ...partial });

  return (
    <details className="rounded-md border p-4">
      <summary className="cursor-pointer text-sm font-medium">Advanced settings</summary>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Crawl preset</Label>
          <Select value={settings.crawlPreset} onValueChange={(value) => patch({ crawlPreset: value as Settings['crawlPreset'] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRESETS.map((preset) => (
                <SelectItem key={preset.value} value={preset.value}>{preset.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Rendering strategy</Label>
          <Select value={scrapingMode} onValueChange={(value) => onScrapingModeChange(value as StoreScrapingMode)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MODES.map((mode) => (
                <SelectItem key={mode.value} value={mode.value}>{mode.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="crawlFrequencyMinutes">Crawl frequency minutes</Label>
          <Input
            id="crawlFrequencyMinutes"
            type="number"
            min={60}
            value={settings.crawlFrequencyMinutes}
            onChange={(event) => patch({ crawlFrequencyMinutes: Number(event.target.value) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="crawlDelaySeconds">Request delay seconds</Label>
          <Input
            id="crawlDelaySeconds"
            type="number"
            min={2}
            value={settings.crawlDelaySeconds}
            onChange={(event) => patch({ crawlDelaySeconds: Number(event.target.value) })}
          />
        </div>
        <SwitchRow
          label="Respect robots.txt"
          checked={settings.respectRobots}
          onChange={(value) => patch({ respectRobots: value })}
        />
        <SwitchRow
          label="Manual captcha mode"
          checked={settings.useManualCaptcha}
          onChange={(value) => patch({ useManualCaptcha: value })}
        />
        <SwitchRow
          label="AI fallback"
          checked={settings.useAi}
          onChange={(value) => patch({ useAi: value })}
        />
        <SwitchRow
          label="Browser rendering"
          checked={settings.jsRequired}
          onChange={(value) => patch({ jsRequired: value })}
        />
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" rows={3} value={notes} onChange={(event) => onNotesChange(event.target.value)} />
        </div>
      </div>
    </details>
  );
}

function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md bg-muted/40 p-3">
      <span className="text-sm font-medium">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
