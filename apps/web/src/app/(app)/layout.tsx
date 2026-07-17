import { Sidebar } from '@/components/app/sidebar';
import { Topbar } from '@/components/app/topbar';
import { getContext } from '@/lib/auth';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  return (
    <div className="bg-muted/30 flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar ctx={ctx} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
