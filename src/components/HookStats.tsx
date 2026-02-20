'use client';

import { useState, useEffect } from 'react';

interface Stats {
  total_analyzed: number;
  avg_score: string;
  top_hook_type: { hook_type: string; count: number; avg_score: string } | null;
  top_niche: { niche: string; count: number } | null;
}

export default function HookStats() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch('/api/hook-lab/stats')
      .then(r => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  if (!stats) return null;

  return (
    <div className="bg-white rounded-2xl p-4 card-shadow">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900">{stats.total_analyzed}</p>
          <p className="text-xs text-gray-500">Analyzed Hooks</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900">{stats.avg_score}<span className="text-sm text-gray-400">/10</span></p>
          <p className="text-xs text-gray-500">Avg Hook Score</p>
        </div>
        <div className="text-center">
          {stats.top_hook_type ? (
            <>
              <p className="text-lg font-bold text-gray-900 capitalize">{stats.top_hook_type.hook_type}</p>
              <p className="text-xs text-gray-500">Top Hook Type ({stats.top_hook_type.count})</p>
            </>
          ) : (
            <>
              <p className="text-lg font-bold text-gray-400">-</p>
              <p className="text-xs text-gray-500">Top Hook Type</p>
            </>
          )}
        </div>
        <div className="text-center">
          {stats.top_niche ? (
            <>
              <p className="text-lg font-bold text-gray-900 capitalize">{stats.top_niche.niche}</p>
              <p className="text-xs text-gray-500">Top Niche ({stats.top_niche.count})</p>
            </>
          ) : (
            <>
              <p className="text-lg font-bold text-gray-400">-</p>
              <p className="text-xs text-gray-500">Top Niche</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
