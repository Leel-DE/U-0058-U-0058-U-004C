import { Badge } from '@/components/ui/badge';

export function DetectionConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const variant = pct >= 80 ? 'success' : pct >= 60 ? 'warning' : 'destructive';
  return <Badge variant={variant}>{pct}% confidence</Badge>;
}
