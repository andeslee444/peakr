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
  post_url: string | null;
  description: string | null;
  posted_at: string | null;
}
