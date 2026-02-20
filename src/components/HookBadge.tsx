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
  'before/after': 'bg-cyan-100 text-cyan-700',
  'social proof': 'bg-amber-100 text-amber-700',
  'POV': 'bg-indigo-100 text-indigo-700',
  'tutorial/value': 'bg-emerald-100 text-emerald-700',
};

const NICHE_COLORS: Record<string, string> = {
  'fitness': 'bg-red-50 text-red-600',
  'finance': 'bg-emerald-50 text-emerald-600',
  'business': 'bg-gray-100 text-gray-600',
  'beauty': 'bg-pink-50 text-pink-600',
  'food': 'bg-orange-50 text-orange-600',
  'comedy': 'bg-yellow-50 text-yellow-600',
  'lifestyle': 'bg-rose-50 text-rose-600',
  'health': 'bg-green-50 text-green-600',
  'fashion': 'bg-fuchsia-50 text-fuchsia-600',
  'tech': 'bg-slate-50 text-slate-600',
  'real-estate': 'bg-amber-50 text-amber-600',
  'education': 'bg-blue-50 text-blue-600',
  'motivation': 'bg-purple-50 text-purple-600',
  'travel': 'bg-sky-50 text-sky-600',
  'parenting': 'bg-indigo-50 text-indigo-600',
};

const EMOTION_COLORS: Record<string, string> = {
  'fear of missing out': 'bg-red-50 text-red-600',
  'curiosity': 'bg-purple-50 text-purple-600',
  'aspiration': 'bg-amber-50 text-amber-600',
  'shock/awe': 'bg-rose-50 text-rose-600',
  'humor': 'bg-yellow-50 text-yellow-600',
  'empathy': 'bg-blue-50 text-blue-600',
  'urgency': 'bg-orange-50 text-orange-600',
  'controversy': 'bg-red-100 text-red-700',
  'nostalgia': 'bg-indigo-50 text-indigo-600',
};

const FORMAT_COLORS: Record<string, string> = {
  'text overlay': 'bg-slate-100 text-slate-600',
  'talking head': 'bg-sky-100 text-sky-600',
  'voiceover + b-roll': 'bg-teal-100 text-teal-600',
  'skit/acting': 'bg-pink-100 text-pink-600',
  'screen recording': 'bg-gray-100 text-gray-600',
  'slideshow': 'bg-violet-100 text-violet-600',
  'transition reveal': 'bg-cyan-100 text-cyan-600',
  'green screen': 'bg-emerald-100 text-emerald-600',
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

export function NicheBadge({ niche }: { niche: string }) {
  const colors = NICHE_COLORS[niche] || 'bg-gray-50 text-gray-500';
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${colors}`}>
      {niche}
    </span>
  );
}

export function EmotionBadge({ emotion }: { emotion: string }) {
  const colors = EMOTION_COLORS[emotion] || 'bg-gray-50 text-gray-500';
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${colors}`}>
      {emotion}
    </span>
  );
}

export function FormatBadge({ format }: { format: string }) {
  const colors = FORMAT_COLORS[format] || 'bg-gray-100 text-gray-500';
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${colors}`}>
      {format}
    </span>
  );
}
