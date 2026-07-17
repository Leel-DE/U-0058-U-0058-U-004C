'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { Result } from '@cr/shared';
import { ConfirmationDialog } from '@/components/confirmation-dialog';
import { deleteCompetitorProduct, deleteMyProduct } from '@/server/actions/products';
import { deleteStore } from '@/server/actions/stores';

function actionData<T>(result: Result<T>) {
  if (!result.ok) throw new Error(result.error.message ?? 'The action failed. Try again.');
  return result.data;
}

export function DeleteStoreControl({
  storeId,
  storeName,
  productCount,
}: {
  storeId: string;
  storeName: string;
  productCount: number;
}) {
  const router = useRouter();
  return (
    <ConfirmationDialog
      triggerLabel="Delete Competitor Site"
      title="Delete Competitor Site"
      description={`This permanently deletes ${storeName}, ${productCount} monitored product${productCount === 1 ? '' : 's'}, discovery records, snapshots, rules, and related queued jobs. This cannot be undone.`}
      confirmationText={storeName}
      confirmLabel="Delete Competitor Site"
      onConfirm={async () => {
        const data = actionData(await deleteStore({ id: storeId }));
        if (data.deleted === 0) throw new Error('The competitor site no longer exists.');
        toast('Competitor site deleted');
        router.push('/competitors');
        router.refresh();
      }}
    />
  );
}

export function DeleteProductControl({
  productId,
  productName,
  kind,
}: {
  productId: string;
  productName: string;
  kind: 'my_product' | 'competitor_product';
}) {
  const router = useRouter();
  const competitor = kind === 'competitor_product';
  return (
    <ConfirmationDialog
      triggerLabel="Delete Product"
      title="Delete Product"
      description={
        competitor
          ? `This permanently deletes ${productName}, its snapshots, matches, and related queued jobs. This cannot be undone.`
          : `This permanently deletes ${productName} and its product matches. Competitor listings remain available. This cannot be undone.`
      }
      confirmLabel="Delete Product"
      onConfirm={async () => {
        const result = competitor
          ? await deleteCompetitorProduct({ id: productId })
          : await deleteMyProduct({ id: productId });
        const data = actionData(result);
        if (data.deleted === 0) throw new Error('The product no longer exists.');
        toast('Product deleted');
        router.push('/products');
        router.refresh();
      }}
    />
  );
}
