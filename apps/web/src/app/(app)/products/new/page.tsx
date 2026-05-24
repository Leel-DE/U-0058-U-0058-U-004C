import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getContext } from '@/lib/auth';
import { MyProductForm } from '../_components/my-product-form';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BulkImport } from '../_components/bulk-import';

export default async function NewMyProductPage() {
  const ctx = await getContext();
  if (ctx.role === 'viewer') redirect('/products');
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Add my product</h1>
        <p className="text-sm text-muted-foreground">
          Your catalog feeds the matching engine and price comparisons.
        </p>
      </header>

      <Tabs defaultValue="single">
        <TabsList>
          <TabsTrigger value="single">Single</TabsTrigger>
          <TabsTrigger value="csv">CSV import</TabsTrigger>
        </TabsList>
        <TabsContent value="single">
          <Card>
            <CardHeader><CardTitle>Product</CardTitle></CardHeader>
            <CardContent><MyProductForm /></CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="csv">
          <Card>
            <CardHeader>
              <CardTitle>Bulk import (CSV)</CardTitle>
            </CardHeader>
            <CardContent>
              <BulkImport
                mode="myProducts"
                helpText="Headers: sku, name, brand, gtin, price. UTF-8, comma-separated."
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
