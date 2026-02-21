import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';

interface SearchResult {
  username: string;
  display_name: string;
  avatar_url: string;
  followers: number;
  post_count: number;
  verified: boolean;
  is_tracked: boolean;
}

async function lookupInstagramUser(query: string): Promise<SearchResult[]> {
  const username = query.replace(/^@/, '').trim().toLowerCase();
  if (!username || !/^[\w.]+$/.test(username)) return [];

  try {
    const resp = await fetch(
      `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
          'X-IG-App-ID': '936619743392459',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-site',
        },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!resp.ok) return [];

    const json = await resp.json();
    const user = json?.data?.user;
    if (!user?.username) return [];

    return [
      {
        username: user.username,
        display_name: user.full_name || user.username,
        avatar_url: user.profile_pic_url_hd || user.profile_pic_url || '',
        followers: user.edge_followed_by?.count ?? 0,
        post_count: user.edge_owner_to_timeline_media?.count ?? 0,
        verified: user.is_verified ?? false,
        is_tracked: false,
      },
    ];
  } catch {
    return [];
  }
}

async function lookupTikTokUser(query: string): Promise<SearchResult[]> {
  const username = query.replace(/^@/, '').trim();
  if (!username) return [];

  try {
    const resp = await fetch(`https://www.tiktok.com/@${username}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) return [];

    const html = await resp.text();
    const match = html.match(
      new RegExp('<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>', 's')
    );
    if (!match) return [];

    const data = JSON.parse(match[1]);
    const scope = data?.__DEFAULT_SCOPE__ ?? {};
    const userInfo = scope?.['webapp.user-detail']?.userInfo ?? {};
    const user = userInfo.user ?? {};
    const stats = userInfo.stats ?? {};

    const uid = user.uniqueId;
    if (!uid) return [];

    return [
      {
        username: uid,
        display_name: user.nickname ?? '',
        avatar_url: user.avatarThumb ?? user.avatarMedium ?? '',
        followers: stats.followerCount ?? 0,
        post_count: stats.videoCount ?? 0,
        verified: user.verified ?? false,
        is_tracked: false,
      },
    ];
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() || '';
  const platform = req.nextUrl.searchParams.get('platform') || 'tiktok';

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  if (!['tiktok', 'instagram'].includes(platform)) {
    return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
  }

  try {
    // Optional auth — don't fail if no session
    const session = await auth().catch(() => null);
    const userId = session?.user?.id ? Number(session.user.id) : null;

    // Run external lookup and local DB query in parallel
    const [externalResults, localResults] = await Promise.all([
      platform === 'tiktok' ? lookupTikTokUser(q) : lookupInstagramUser(q),
      getPool()
        .query(
          `SELECT username, display_name, avatar_url, followers, post_count
           FROM profiles
           WHERE platform = $1 AND username ILIKE $2
           ORDER BY followers DESC NULLS LAST
           LIMIT 8`,
          [platform, `%${q}%`]
        )
        .then((r) => r.rows),
    ]);

    // Build tracked username set from junction table (per-user) if logged in
    let trackedSet: Set<string>;
    if (userId) {
      const { rows: trackedRows } = await getPool().query(
        `SELECT pr.username FROM user_tracked_profiles utp
         JOIN profiles pr ON utp.profile_id = pr.id
         WHERE utp.user_id = $1 AND pr.platform = $2`,
        [userId, platform]
      );
      trackedSet = new Set(trackedRows.map((r: { username: string }) => r.username.toLowerCase()));
    } else {
      trackedSet = new Set();
    }

    // Start with local results (flag as tracked based on junction table)
    const merged: SearchResult[] = localResults.map(
      (r: Record<string, unknown>) => ({
        username: r.username as string,
        display_name: (r.display_name as string) || '',
        avatar_url: (r.avatar_url as string) || '',
        followers: (r.followers as number) || 0,
        post_count: (r.post_count as number) || 0,
        verified: false,
        is_tracked: trackedSet.has((r.username as string).toLowerCase()),
      })
    );

    // Append external results that aren't already in local
    for (const ext of externalResults) {
      const lowerUsername = ext.username.toLowerCase();
      const existing = merged.find(m => m.username.toLowerCase() === lowerUsername);
      if (!existing) {
        ext.is_tracked = trackedSet.has(lowerUsername);
        merged.push(ext);
      } else {
        if (!existing.avatar_url && ext.avatar_url) existing.avatar_url = ext.avatar_url;
        if (ext.followers > existing.followers) existing.followers = ext.followers;
        if (ext.post_count > existing.post_count) existing.post_count = ext.post_count;
      }
    }

    return NextResponse.json({ results: merged.slice(0, 10) });
  } catch (err) {
    console.error('Search accounts error:', err);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
