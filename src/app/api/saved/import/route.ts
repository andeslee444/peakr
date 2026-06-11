import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { isTikTokUrl, parseTikTokUrl, parseFromOEmbed } from '@/lib/tiktok-url';
import { isInstagramReelUrl, parseInstagramReelUrl } from '@/lib/instagram-url';
import { normalizeTemplate } from '@/lib/normalize-template';
import { recomputePatternStats } from '@/lib/hook-patterns';

interface OEmbedResponse {
  title: string;
  author_name: string;
  author_url: string;
  thumbnail_url: string;
  thumbnail_width: number;
  thumbnail_height: number;
  html: string;
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = Number(session.user.id);

    const body = await request.json();
    const { url, folder = 'default' } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }

    const trimmedUrl = url.trim();

    // Detect platform
    const isTikTok = isTikTokUrl(trimmedUrl);
    const isInstagramReel = isInstagramReelUrl(trimmedUrl);

    if (!isTikTok && !isInstagramReel) {
      return NextResponse.json(
        { error: 'Not a valid TikTok or Instagram Reel URL' },
        { status: 400 },
      );
    }

    let username: string;
    let platformId: string;
    let postUrl: string;
    let platform: 'tiktok' | 'instagram';
    let thumbnailUrl: string | null = null;
    let description: string | null = null;
    let displayName: string | null = null;

    if (isTikTok) {
      // --- TikTok path ---
      platform = 'tiktok';

      const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(trimmedUrl)}`;
      const oembedRes = await fetch(oembedUrl);
      if (!oembedRes.ok) {
        return NextResponse.json(
          { error: 'Could not fetch video info. Make sure the URL is a valid, public TikTok video.' },
          { status: 422 },
        );
      }
      const oembed: OEmbedResponse = await oembedRes.json();

      let parsed = parseTikTokUrl(trimmedUrl);
      if (!parsed) {
        parsed = parseFromOEmbed(oembed.html, oembed.author_url);
      }
      if (!parsed) {
        return NextResponse.json(
          { error: 'Could not extract video details from this URL' },
          { status: 422 },
        );
      }

      username = parsed.username;
      platformId = parsed.videoId;
      postUrl = `https://www.tiktok.com/@${username}/video/${platformId}`;
      thumbnailUrl = oembed.thumbnail_url;
      description = oembed.title;
      displayName = oembed.author_name;
    } else {
      // --- Instagram Reel path ---
      platform = 'instagram';

      const parsed = parseInstagramReelUrl(trimmedUrl);
      if (!parsed) {
        return NextResponse.json(
          { error: 'Could not extract Reel details from this URL' },
          { status: 422 },
        );
      }

      platformId = parsed.shortcode;

      // Fetch oEmbed metadata from Instagram's internal endpoint
      const oembedUrl = `https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(trimmedUrl)}`;
      const oembedRes = await fetch(oembedUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      });
      if (!oembedRes.ok) {
        return NextResponse.json(
          { error: 'Could not fetch video info. Make sure the URL is a valid, public Instagram post.' },
          { status: 422 },
        );
      }
      const oembed: OEmbedResponse = await oembedRes.json();

      // Extract username from author_url (e.g. "https://www.instagram.com/username/")
      const authorMatch = oembed.author_url?.match(/instagram\.com\/([^/?]+)/);
      username = authorMatch ? authorMatch[1] : oembed.author_name;

      postUrl = `https://www.instagram.com/reel/${platformId}/`;
      thumbnailUrl = oembed.thumbnail_url || null;
      description = oembed.title || null;
      displayName = oembed.author_name;
    }

    // --- Shared DB transaction ---
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Upsert profile — don't overwrite data that a real scrape may have populated
      const { rows: [profile] } = await client.query(
        `INSERT INTO profiles (username, platform, display_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (username, platform) DO UPDATE SET display_name = COALESCE(profiles.display_name, EXCLUDED.display_name)
         RETURNING id`,
        [username, platform, displayName],
      );

      // Upsert post — only fill fields that are empty/missing
      const { rows: [post] } = await client.query(
        `INSERT INTO posts (profile_id, platform_id, post_url, thumbnail_url, description, is_video)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (profile_id, platform_id) DO UPDATE SET
           thumbnail_url = COALESCE(posts.thumbnail_url, EXCLUDED.thumbnail_url),
           description = COALESCE(posts.description, EXCLUDED.description),
           post_url = COALESCE(posts.post_url, EXCLUDED.post_url)
         RETURNING id`,
        [profile.id, platformId, postUrl, thumbnailUrl, description],
      );

      // Check for duplicate saved_post (scoped to this user)
      const { rows: existing } = await client.query(
        'SELECT id FROM saved_posts WHERE user_id = $1 AND post_id = $2',
        [userId, post.id],
      );

      if (existing.length > 0) {
        await client.query('COMMIT');
        return NextResponse.json({
          id: existing[0].id,
          post_id: post.id,
          folder,
          already_saved: true,
        });
      }

      const { rows: [saved] } = await client.query(
        'INSERT INTO saved_posts (user_id, post_id, folder) VALUES ($1, $2, $3) RETURNING id',
        [userId, post.id, folder],
      );

      // Also save to hook_patterns + user_saved_patterns if user is logged in
      if (userId) {
        const { rows: [postData] } = await client.query(
          'SELECT hook_analysis FROM posts WHERE id = $1',
          [post.id]
        );
        const analysis = postData?.hook_analysis;
        const rawTemplate = analysis?.hook_template ? String(analysis.hook_template) : null;
        const canonical = rawTemplate ? normalizeTemplate(rawTemplate) : null;

        if (canonical) {
          const hookType = analysis?.hook_type || null;
          const niche = analysis?.niche || null;

          // Upsert global pattern
          const { rows: [pattern] } = await client.query(
            `INSERT INTO hook_patterns (canonical_template, display_name, hook_type, niche)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (canonical_template) DO UPDATE SET updated_at = NOW()
             RETURNING id`,
            [canonical, rawTemplate, hookType, niche]
          );

          // Link post to pattern
          await client.query(
            `INSERT INTO hook_pattern_posts (pattern_id, post_id)
             VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [pattern.id, post.id]
          );

          // Recompute pattern stats so imported patterns don't carry stale
          // example_count / averages (the manual-save path already does this).
          await recomputePatternStats(client, pattern.id);

          // Save pattern for user
          await client.query(
            `INSERT INTO user_saved_patterns (user_id, pattern_id)
             VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [userId, pattern.id]
          );
        }
      }

      await client.query('COMMIT');

      return NextResponse.json({
        id: saved.id,
        post_id: post.id,
        folder,
        already_saved: false,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Import error:', err);
    return NextResponse.json({ error: 'Failed to import link' }, { status: 500 });
  }
}
