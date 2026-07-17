import { Badge } from '@/components/ui/badge';

const LABELS: Record<string, string> = {
  pending: 'Ожидает проверки',
  info_received: 'Зарегистрирована',
  in_transit: 'В пути',
  customs: 'На таможне',
  out_for_delivery: 'У курьера',
  delivered: 'Доставлена',
  exception: 'Нужна проверка',
  returned: 'Возврат',
  unknown: 'Нет данных',
};

export function ShipmentStatusBadge({ status }: { status: string }) {
  const variant =
    status === 'delivered'
      ? 'success'
      : status === 'exception' || status === 'returned'
        ? 'destructive'
        : status === 'customs' || status === 'out_for_delivery'
          ? 'warning'
          : 'secondary';
  return <Badge variant={variant}>{LABELS[status] ?? status}</Badge>;
}
