'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Save, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { StoreAnalysisResult, StoreScrapingMode } from '@cr/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { FormError } from '@/components/form-message';
import { analyzeStore } from '@/server/actions/scrape';
import { createAnalyzedStore } from '@/server/actions/stores';
import { AdvancedScrapingSettings } from './AdvancedScrapingSettings';
import { StoreAnalysisPreview } from './StoreAnalysisPreview';
import { StoreAnalysisProgress } from './StoreAnalysisProgress';

export function IntelligentStoreOnboarding({ manualFallback }: { manualFallback?: ReactNode }) {
  const router = useRouter();
  const [homepageUrl, setHomepageUrl] = useState('');
  const [useAi, setUseAi] = useState(false);
  const [analysis, setAnalysis] = useState<StoreAnalysisResult | null>(null);
  const [settings, setSettings] = useState<StoreAnalysisResult['recommendedSettings'] | null>(null);
  const [scrapingMode, setScrapingMode] = useState<StoreScrapingMode>('cheerio');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [analyzing, startAnalyze] = useTransition();
  const [saving, startSave] = useTransition();

  function runAnalysis() {
    setError(null);
    setAnalysis(null);
    try {
      new URL(homepageUrl);
    } catch {
      setError('Enter a valid homepage URL.');
      return;
    }

    startAnalyze(async () => {
      const response = await analyzeStore({ homepageUrl, useAi });
      if (!response.ok) {
        setError(response.error.message);
        return;
      }
      const payload = response.data as unknown as StoreAnalysisResult & { ok?: boolean; message?: string };
      if (payload.ok === false) {
        setError(payload.message ?? 'Store analysis failed.');
        return;
      }
      setAnalysis(payload);
      setSettings(payload.recommendedSettings);
      setScrapingMode(payload.scrapingMode);
    });
  }

  function saveStore() {
    if (!analysis || !settings) return;
    setError(null);
    const effectiveSettings = {
      ...settings,
      jsRequired: settings.jsRequired || scrapingMode === 'playwright_primary',
    };
    startSave(async () => {
      const response = await createAnalyzedStore({
        store: analysis.store,
        selectors: analysis.selectors,
        recommendedSettings: effectiveSettings,
        profile: {
          framework: analysis.framework.framework,
          renderingStrategy: analysis.renderingStrategy.strategy,
          scrapeDifficulty: analysis.scrapingProfile.crawlDifficulty,
          antiBotRisk: analysis.scrapingProfile.antiBotRisk,
          recommendedMode: scrapingMode,
          detectionConfidence: analysis.confidence,
          autoDetectedSettingsJson: {
            framework: analysis.framework,
            renderingStrategy: analysis.renderingStrategy,
            scrapingProfile: analysis.scrapingProfile,
            examples: analysis.examples,
            warnings: analysis.warnings,
            selectedSettings: effectiveSettings,
          },
        },
        notes: notes || undefined,
      });
      if (!response.ok) {
        setError(response.error.message);
        return;
      }
      toast.success('Competitor store is ready');
      router.replace(`/competitors/${response.data.id}/discovery`);
      router.refresh();
    });
  }

  if (showManual && manualFallback) return <>{manualFallback}</>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add competitor store</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="homepageUrl">Homepage URL</Label>
            <Input
              id="homepageUrl"
              type="url"
              placeholder="https://www.obi.de"
              value={homepageUrl}
              onChange={(event) => setHomepageUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  runAnalysis();
                }
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Use AI assistance if needed</div>
              <div className="text-xs text-muted-foreground">Gemini is only used when local heuristics are not confident enough.</div>
            </div>
            <Switch checked={useAi} onCheckedChange={setUseAi} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={runAnalysis} disabled={analyzing || saving}>
              <Search className="h-4 w-4" />
              {analyzing ? 'Analyzing...' : 'Analyze store'}
            </Button>
            {analysis ? (
              <Button type="button" variant="outline" onClick={() => setAnalysis(null)} disabled={analyzing || saving}>
                <RotateCcw className="h-4 w-4" />
                Reset analysis
              </Button>
            ) : null}
          </div>
          <FormError message={error} />
        </CardContent>
      </Card>

      {analyzing ? <StoreAnalysisProgress active /> : null}

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4" />
            Analysis did not complete
          </div>
          <p className="text-sm text-muted-foreground">{error}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={runAnalysis} disabled={analyzing}>
              Retry analysis
            </Button>
            {manualFallback ? (
              <Button type="button" variant="outline" onClick={() => setShowManual(true)}>
                Manual mode
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {analysis && settings ? (
        <>
          <StoreAnalysisPreview analysis={analysis} />
          <AdvancedScrapingSettings
            settings={settings}
            onSettingsChange={setSettings}
            notes={notes}
            onNotesChange={setNotes}
            scrapingMode={scrapingMode}
            onScrapingModeChange={setScrapingMode}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={runAnalysis} disabled={analyzing || saving}>
              Re-run analysis
            </Button>
            <Button type="button" onClick={saveStore} disabled={saving || analyzing}>
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Confirm and save store'}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
