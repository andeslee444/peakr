'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ExplorePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/hook-lab');
  }, [router]);

  return (
    <div className="text-center py-16 text-gray-500">
      Redirecting to Hook Lab...
    </div>
  );
}
