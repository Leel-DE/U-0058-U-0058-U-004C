import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntelligentStoreOnboarding } from '@/components/competitors/IntelligentStoreOnboarding';
import { analyzeStore } from '@/server/actions/scrape';
import { createAnalyzedStore } from '@/server/actions/stores';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('@/server/actions/scrape', () => ({
  analyzeStore: vi.fn(),
}));

vi.mock('@/server/actions/stores', () => ({
  createAnalyzedStore: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const analysis = {
  ok: true,
  store: {
    name: 'OBI',
    domain: 'obi.de',
    homepageUrl: 'https://www.obi.de/',
    countryCode: 'DE',
    currency: 'EUR',
    language: 'de',
  },
  framework: { framework: 'shopware', label: 'Shopware', confidence: 0.9, signals: ['shopware_signature'] },
  renderingStrategy: {
    strategy: 'hybrid',
    scrapingMode: 'hybrid',
    hydration: 'partial',
    confidence: 0.82,
    signals: ['server_rendered_cards:12'],
    explanation: 'Static HTML is usable with browser fallback.',
  },
  scrapingMode: 'hybrid',
  selectors: {
    productSelectors: { titleSelector: 'h1', priceSelector: '.price' },
    categorySelectors: {
      productCardSelector: '.product-card',
      cardTitleSelector: 'h2',
      cardPriceSelector: '.price',
      cardLinkSelector: 'a[href]',
      paginationNextSelector: 'a[rel="next"]',
    },
  },
  previews: {
    product: { title: 'Hammer Drill', price: 99.9, currency: 'EUR', image: 'https://www.obi.de/drill.jpg' },
    category: {
      cardCount: 2,
      paginationNext: 'https://www.obi.de/c/tools?page=2',
      cards: [{ title: 'Hammer Drill', price: 99.9, currency: 'EUR', link: 'https://www.obi.de/p/drill' }],
    },
  },
  validation: {},
  examples: {
    productPageUrl: 'https://www.obi.de/p/drill',
    categoryPageUrl: 'https://www.obi.de/c/tools',
    listingPageUrls: ['https://www.obi.de/c/tools'],
    productPageUrls: ['https://www.obi.de/p/drill'],
    sitemapUrls: ['https://www.obi.de/sitemap.xml'],
  },
  scrapingProfile: {
    crawlDifficulty: 'medium',
    antiBotRisk: 'low',
    recommendedMode: 'hybrid',
    recommendedDelaySeconds: 5,
    expectedScrapeStability: 'medium',
    crawlPreset: 'balanced',
    reasons: ['hybrid rendering'],
  },
  warnings: [],
  confidence: 0.92,
  recommendedSettings: {
    crawlPreset: 'balanced',
    crawlFrequencyMinutes: 1440,
    crawlDelaySeconds: 5,
    respectRobots: true,
    jsRequired: false,
    useManualCaptcha: false,
    useAi: false,
    discoveryPreset: 'normal',
    discoveryDefaultsJson: { maxPages: 250 },
  },
  logs: [{ level: 'info', message: 'framework detected' }],
};

describe('IntelligentStoreOnboarding', () => {
  beforeEach(() => {
    vi.mocked(analyzeStore).mockReset();
    vi.mocked(createAnalyzedStore).mockReset();
  });

  it('runs homepage-only analysis and renders preview', async () => {
    const user = userEvent.setup();
    vi.mocked(analyzeStore).mockResolvedValue({ ok: true, data: analysis });

    render(<IntelligentStoreOnboarding />);

    expect(screen.queryByLabelText(/Product URL/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Category URL/i)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/Homepage URL/i), 'https://www.obi.de/');
    await user.click(screen.getByRole('button', { name: /Analyze store/i }));

    await waitFor(() => {
      expect(analyzeStore).toHaveBeenCalledWith({ homepageUrl: 'https://www.obi.de/', useAi: false });
    });
    expect(await screen.findByText('OBI')).toBeInTheDocument();
    expect(screen.getByText('Shopware')).toBeInTheDocument();
    expect(screen.getAllByText('Hammer Drill').length).toBeGreaterThan(0);
    expect(screen.getByText('92% confidence')).toBeInTheDocument();
  });

  it('keeps advanced settings collapsed and saves confirmed selectors', async () => {
    const user = userEvent.setup();
    vi.mocked(analyzeStore).mockResolvedValue({ ok: true, data: analysis });
    vi.mocked(createAnalyzedStore).mockResolvedValue({
      ok: true,
      data: { id: '00000000-0000-4000-8000-000000000001' },
    });

    render(<IntelligentStoreOnboarding />);

    await user.type(screen.getByLabelText(/Homepage URL/i), 'https://www.obi.de/');
    await user.click(screen.getByRole('button', { name: /Analyze store/i }));
    await screen.findByText('OBI');

    expect(screen.getByLabelText(/Request delay seconds/i)).not.toBeVisible();
    await user.click(screen.getByText('Advanced settings'));
    expect(screen.getByLabelText(/Request delay seconds/i)).toBeVisible();

    await user.click(screen.getByRole('button', { name: /Confirm and save store/i }));
    await waitFor(() => {
      expect(createAnalyzedStore).toHaveBeenCalledWith(
        expect.objectContaining({
          store: expect.objectContaining({ domain: 'obi.de' }),
          selectors: expect.objectContaining({
            categorySelectors: expect.objectContaining({ productCardSelector: '.product-card' }),
          }),
        }),
      );
    });
  });
});
