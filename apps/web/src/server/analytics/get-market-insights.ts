import { getCategoryAnalytics } from './get-category-analytics';
import { getCompetitorAnalytics } from './get-competitor-analytics';
import { getDataQuality } from './get-data-quality';
import { getProductMovements } from './get-product-movements';
import type { AnalyticsFilters, MarketInsight } from './types';

export async function getMarketInsights(orgId: string, filters: AnalyticsFilters): Promise<MarketInsight[]> {
  const [categories, competitors, movements, quality] = await Promise.all([
    getCategoryAnalytics(orgId, filters),
    getCompetitorAnalytics(orgId, filters),
    getProductMovements(orgId, filters),
    getDataQuality(orgId, filters),
  ]);

  const insights: MarketInsight[] = [];
  for (const category of categories.filter((row) => row.trend === 'falling').slice(0, 5)) {
    insights.push({
      id: `category-drop-${category.category}`,
      type: 'price_drop_trend',
      title: `${category.category} prices are falling`,
      description: `Average category price trend is down with ${category.priceChanges} captured price changes.`,
      severity: 'success',
      metric: `${category.volatilityScore.toFixed(0)} volatility`,
      href: `/analytics/categories?category=${encodeURIComponent(category.categoryId ?? category.category)}`,
    });
  }

  const aggressive = competitors.filter((row) => row.aggressivenessScore >= 25).sort((a, b) => b.aggressivenessScore - a.aggressivenessScore).slice(0, 5);
  for (const competitor of aggressive) {
    insights.push({
      id: `aggressive-${competitor.competitorId}`,
      type: 'aggressive_competitor',
      title: `${competitor.competitorName} is moving aggressively`,
      description: `${competitor.priceDrops} drops, ${competitor.priceChanges} total price changes, ${competitor.avgDiscount.toFixed(1)}% average discount.`,
      severity: competitor.aggressivenessScore >= 60 ? 'critical' : 'warning',
      metric: `${competitor.aggressivenessScore.toFixed(0)}/100`,
      href: `/analytics/competitors?competitor=${encodeURIComponent(competitor.competitorId)}`,
    });
  }

  for (const product of movements.mostDiscounted.slice(0, 5)) {
    insights.push({
      id: `discount-${product.competitorProductId}`,
      type: 'discount_spike',
      title: `${product.productTitle} has a strong discount`,
      description: `${product.competitorName} currently discounts this product by ${product.deltaPct?.toFixed(1) ?? 'n/a'}%.`,
      severity: 'info',
      metric: `${product.deltaPct?.toFixed(1) ?? 0}%`,
      href: product.href,
    });
  }

  for (const product of movements.mostVolatile.slice(0, 5)) {
    insights.push({
      id: `volatile-${product.competitorProductId}`,
      type: 'unusual_activity',
      title: `${product.productTitle} is volatile`,
      description: `Historical spread is ${product.deltaPct?.toFixed(1) ?? 'n/a'}% for ${product.competitorName}.`,
      severity: 'warning',
      metric: `${product.deltaPct?.toFixed(1) ?? 0}%`,
      href: product.href,
    });
  }

  for (const product of movements.staleProducts.slice(0, 5)) {
    insights.push({
      id: `stale-${product.competitorProductId}`,
      type: 'stale_monitoring',
      title: `${product.productTitle} has stale monitoring`,
      description: `${product.competitorName} has not produced fresh data recently.`,
      severity: 'warning',
      metric: `${Math.round(product.metric ?? 0)}h`,
      href: product.href,
    });
  }

  if (quality.summary.captchaManualSessions > 0 || quality.summary.failedExtractions > 0) {
    insights.push({
      id: 'data-quality-warning',
      type: 'stale_monitoring',
      title: 'Data collection quality needs attention',
      description: `${quality.summary.failedExtractions} failed extractions and ${quality.summary.captchaManualSessions} manual sessions are active.`,
      severity: quality.summary.failedExtractions > 10 ? 'critical' : 'warning',
      metric: `${quality.summary.dataQualityScore}/100`,
      href: '/analytics/data-quality',
    });
  }

  return insights.slice(0, 40);
}
