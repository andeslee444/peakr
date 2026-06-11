'use client';

export interface HookFilterState {
  hook_type: string;
  niche: string;
  hook_format: string;
  emotional_trigger: string;
  min_score: string;
  platform: string;
  search: string;
  analyzed_only: boolean;
  sort: string;
}

export const DEFAULT_FILTERS: HookFilterState = {
  hook_type: '',
  niche: '',
  hook_format: '',
  emotional_trigger: '',
  min_score: '',
  platform: 'all',
  search: '',
  analyzed_only: true,
  sort: 'viral_score',
};

/** Whether any narrowing filter is active (used to offer a "Clear filters"
 *  escape from a silently-empty result set — usually an auto-applied niche). */
export function hasActiveFilters(f: HookFilterState): boolean {
  return (
    !!f.hook_type ||
    !!f.niche ||
    !!f.hook_format ||
    !!f.emotional_trigger ||
    !!f.min_score ||
    !!f.search ||
    f.platform !== 'all'
  );
}

const HOOK_TYPES = [
  'question', 'shock/surprise', 'curiosity gap', 'story opener', 'bold claim',
  'visual spectacle', 'direct address', 'trend/sound', 'before/after', 'social proof',
  'POV', 'tutorial/value',
];

const NICHES = [
  'fitness', 'finance', 'business', 'beauty', 'food', 'comedy',
  'lifestyle', 'health', 'fashion', 'tech', 'real-estate', 'education',
  'motivation', 'travel', 'parenting',
];

const FORMATS = [
  'text overlay', 'talking head', 'voiceover + b-roll', 'skit/acting',
  'screen recording', 'slideshow', 'transition reveal', 'green screen',
];

const EMOTIONS = [
  'fear of missing out', 'curiosity', 'aspiration', 'shock/awe',
  'humor', 'empathy', 'urgency', 'controversy', 'nostalgia',
];

interface HookFiltersProps {
  filters: HookFilterState;
  onChange: (filters: HookFilterState) => void;
  onFlipAll: () => void;
  allFlipped: boolean;
}

export default function HookFilters({ filters, onChange, onFlipAll, allFlipped }: HookFiltersProps) {
  const update = (key: keyof HookFilterState, value: string | boolean) => {
    onChange({ ...filters, [key]: value });
  };

  const activeCount = [
    filters.hook_type, filters.niche, filters.hook_format,
    filters.emotional_trigger, filters.min_score, filters.search,
  ].filter(Boolean).length + (filters.platform !== 'all' ? 1 : 0);

  return (
    <div className="bg-white rounded-2xl p-4 card-shadow space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-700">Filters</h3>
          {activeCount > 0 && (
            <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-medium">
              {activeCount} active
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onFlipAll}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
              allFlipped
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {allFlipped ? 'Unflip All' : 'Flip All'}
          </button>
          {activeCount > 0 && (
            <button
              onClick={() => onChange(DEFAULT_FILTERS)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search username or description..."
            value={filters.search}
            onChange={(e) => update('search', e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        {/* Hook Type */}
        <select
          value={filters.hook_type}
          onChange={(e) => update('hook_type', e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          <option value="">All Hook Types</option>
          {HOOK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {/* Niche */}
        <select
          value={filters.niche}
          onChange={(e) => update('niche', e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          <option value="">All Niches</option>
          {NICHES.map(n => <option key={n} value={n}>{n}</option>)}
        </select>

        {/* Format */}
        <select
          value={filters.hook_format}
          onChange={(e) => update('hook_format', e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          <option value="">All Formats</option>
          {FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
        </select>

        {/* Emotional Trigger */}
        <select
          value={filters.emotional_trigger}
          onChange={(e) => update('emotional_trigger', e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          <option value="">All Emotions</option>
          {EMOTIONS.map(e => <option key={e} value={e}>{e}</option>)}
        </select>

        {/* Min Score */}
        <select
          value={filters.min_score}
          onChange={(e) => update('min_score', e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          <option value="">Any Score</option>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(s => (
            <option key={s} value={String(s)}>{s}+ / 10</option>
          ))}
        </select>

        {/* Platform */}
        <select
          value={filters.platform}
          onChange={(e) => update('platform', e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          <option value="all">All Platforms</option>
          <option value="instagram">Instagram</option>
          <option value="tiktok">TikTok</option>
        </select>

        {/* Sort */}
        <select
          value={filters.sort}
          onChange={(e) => update('sort', e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          <option value="viral_score">Sort: Viral Score</option>
          <option value="hook_score">Sort: Hook Score</option>
          <option value="views">Sort: Views</option>
          <option value="recent">Sort: Recent</option>
        </select>

        {/* Analyzed Only */}
        <label className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.analyzed_only}
            onChange={(e) => update('analyzed_only', e.target.checked)}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          Analyzed only
        </label>
      </div>
    </div>
  );
}
