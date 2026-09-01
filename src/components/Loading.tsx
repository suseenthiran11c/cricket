import { Loader2 } from 'lucide-react';

export default function Loading({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}
