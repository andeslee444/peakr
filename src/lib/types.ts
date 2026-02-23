export interface HookAnalysis {
  hook_type: string;
  hook_text: string;
  hook_visual: string;
  hook_explanation: string;
  hook_score: number;
  niche?: string;
  hook_format?: string;
  target_audience?: string;
  emotional_trigger?: string;
  cta_type?: string | null;
  hook_template?: string;
}

export interface Profile {
  id: number;
  username: string;
  platform: string;
  display_name: string | null;
  avatar_url: string | null;
  followers: number;
  following: number;
  total_likes: number;
  post_count: number;
  avg_views: number;
  last_scraped_at: string | null;
  created_at: string;
  // Aggregated fields from JOIN queries
  post_count_actual?: number;
  avg_views_calc?: number;
  total_views?: number;
  avg_viral?: number;
}

export interface Post {
  id: number;
  profile_id: number;
  platform_id: string;
  username: string;
  platform: string;
  avatar_url: string | null;
  thumbnail_url: string | null;
  s3_thumbnail_url: string | null;
  post_url: string | null;
  description: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  viral_score: number;
  posted_at: string | null;
  duration_seconds: number | null;
  is_video: boolean;
  transcript: string | null;
  hook_analysis: HookAnalysis | null;
  analyzed_at: string | null;
  audio_name: string | null;
  audio_author: string | null;
}

export interface SuggestionHook {
  post_id: number;
  hook_template: string;
  hook_type: string;
  hook_score: number;
  viral_score: number;
  views: number;
}

export interface CreatorSuggestion {
  username: string;
  platform: string;
  display_name: string | null;
  avatar_url: string | null;
  followers: number;
  niche: string;
  why_text: string;
  top_hooks: SuggestionHook[];
}

export interface UserHook {
  id: number;              // user_saved_patterns.id
  pattern_id: number;
  canonical_template: string;
  display_name: string | null;
  hook_type: string | null;
  niche: string | null;
  notes: string | null;
  example_count: number;   // global count from hook_patterns
  avg_viral_score: number; // from hook_patterns
  avg_views: number;       // from hook_patterns
  top_example: {
    post_id: number;
    thumbnail_url: string | null;
    s3_thumbnail_url: string | null;
    viral_score: number;
    views: number;
    username: string;
    platform: string;
  } | null;
  saved_at: string;
}

export interface UserHookDetail extends UserHook {
  examples: Array<{
    post_id: number;
    post_url: string | null;
    thumbnail_url: string | null;
    s3_thumbnail_url: string | null;
    description: string | null;
    views: number;
    likes: number;
    viral_score: number;
    username: string;
    platform: string;
    avatar_url: string | null;
    hook_analysis: HookAnalysis | null;
    linked_at: string;
  }>;
  total_examples: number;   // for pagination
}

export interface SavedPost {
  id: number;
  post_id: number;
  folder: string;
  notes: string | null;
  saved_at: string;
  username: string;
  platform: string;
  avatar_url: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  viral_score: number;
  thumbnail_url: string | null;
  s3_thumbnail_url: string | null;
  post_url: string | null;
  description: string | null;
  posted_at: string | null;
  transcript: string | null;
  hook_analysis: HookAnalysis | null;
  analyzed_at: string | null;
}
