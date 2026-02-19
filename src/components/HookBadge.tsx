import type { HookAnalysis } from '@/lib/types';

const HOOK_TYPE_COLORS: Record<string, string> = {
  'question': 'bg-blue-100 text-blue-700',
  'shock/surprise': 'bg-red-100 text-red-700',
  'curiosity gap': 'bg-purple-100 text-purple-700',
  'story opener': 'bg-green-100 text-green-700',
  'bold claim': 'bg-orange-100 text-orange-700',
  'visual spectacle': 'bg-pink-100 text-pink-700',
  'direct address': 'bg-teal-100 text-teal-700',
  'trend/sound': 'bg-yellow-100 text-yellow-700',
};

export function HookTypeBadge({ hookType }: { hookType: string }) {
  const colors = HOOK_TYPE_COLORS[hookType] || 'bg-gray-100 text-gray-700';
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${colors}`}>
      {hookType}
    </span>
  );
}

export function HookScoreBadge({ score }: { score: number }) {
  const color = score >= 8 ? 'text-green-600' : score >= 5 ? 'text-yellow-600' : 'text-gray-500';
  return (
    <span className={`text-[10px] font-bold ${color}`}>
      {score}/10
    </span>
  );
}

export function HookOverlay({ analysis }: { analysis: HookAnalysis }) {
  return (
    <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
      <HookTypeBadge hookType={analysis.hook_type} />
      <span className="bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
        {analysis.hook_score}/10
      </span>
    </div>
  );
}

export function HookTextExcerpt({ analysis }: { analysis: HookAnalysis }) {
  if (!analysis.hook_text) return null;
  const text = analysis.hook_text.length > 80
    ? analysis.hook_text.slice(0, 80) + '...'
    : analysis.hook_text;
  return (
    <p className="text-xs text-gray-500 mt-1 italic line-clamp-2">&ldquo;{text}&rdquo;</p>
  );
}
