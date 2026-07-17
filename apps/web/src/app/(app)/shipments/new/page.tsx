import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShipmentForm } from '../_components/shipment-form';

export default function NewShipmentPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/shipments">
          <ArrowLeft className="h-4 w-4" />
          Назад к посылкам
        </Link>
      </Button>
      <header>
        <p className="text-primary text-sm font-medium">Shipments</p>
        <h1 className="text-2xl font-semibold tracking-tight">Добавить посылку</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Automation Hub проверит публичные страницы нескольких служб и соберёт единый результат.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Данные отправления</CardTitle>
          <CardDescription>Достаточно одного трек-номера.</CardDescription>
        </CardHeader>
        <CardContent>
          <ShipmentForm />
        </CardContent>
      </Card>
    </div>
  );
}
