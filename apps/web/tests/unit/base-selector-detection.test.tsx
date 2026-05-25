import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  SaveDetectedRulesButton,
  SelectorPreviewPanel,
  type RuleFormValues,
} from '@/app/(app)/competitors/_components/base-selector-detection';

vi.mock('@/server/actions/scrape', () => ({
  detectBaseSelectors: vi.fn(),
}));

vi.mock('@/server/actions/stores', () => ({
  updateScrapingRules: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('base selector detection UI', () => {
  it('renders detected preview values', () => {
    render(
      <SelectorPreviewPanel
        result={{
          confidence: { product: 0.8, category: 0.7 },
          preview: {
            product: {
              title: 'Trail Bike 900',
              price: 1299,
              oldPrice: 1499,
              currency: 'EUR',
              availability: 'in_stock',
              image: 'https://shop.test/bike.jpg',
            },
            category: {
              cardCount: 2,
              paginationNext: 'https://shop.test/c?page=2',
              cards: [
                {
                  title: 'Trail Bike 900',
                  price: 1299,
                  currency: 'EUR',
                  link: 'https://shop.test/p/bike',
                },
              ],
            },
          },
        }}
      />,
    );

    expect(screen.getAllByText('Trail Bike 900').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1299 EUR').length).toBeGreaterThan(0);
    expect(screen.getByText('https://shop.test/c?page=2')).toBeInTheDocument();
    expect(screen.getByText('2 cards')).toBeInTheDocument();
  });

  it('saves confirmed rules through the supplied callback', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => ({ ok: true as const, data: { ok: true } }));
    const values = {
      titleSelector: 'h1',
      priceSelector: '.price',
      productCardSelector: '.product-card',
      useJsonLd: true,
      useOpenGraph: true,
    } as RuleFormValues;

    render(
      <SaveDetectedRulesButton
        storeId="00000000-0000-4000-8000-000000000010"
        values={values}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole('button', { name: /save detected rules/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: '00000000-0000-4000-8000-000000000010',
          titleSelector: 'h1',
          priceSelector: '.price',
          productCardSelector: '.product-card',
        }),
      );
    });
  });
});
