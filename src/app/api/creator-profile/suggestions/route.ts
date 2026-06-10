import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { enforceRateLimitFor } from '@/lib/rate-limit';
import type { CreatorSuggestion, SuggestionHook } from '@/lib/types';

const ADJACENT: Record<string, string[]> = {
  fitness: ['health', 'lifestyle', 'motivation'],
  finance: ['business', 'real-estate', 'education'],
  business: ['finance', 'motivation', 'education'],
  beauty: ['fashion', 'lifestyle'],
  food: ['health', 'lifestyle'],
  comedy: ['lifestyle'],
  lifestyle: ['beauty', 'fashion', 'travel', 'food'],
  health: ['fitness', 'food', 'parenting'],
  fashion: ['beauty', 'lifestyle'],
  tech: ['business', 'education'],
  'real-estate': ['finance', 'business'],
  education: ['tech', 'business', 'motivation'],
  motivation: ['fitness', 'business', 'education'],
  travel: ['lifestyle', 'food'],
  parenting: ['health', 'lifestyle', 'education'],
};

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const limited = enforceRateLimitFor(`suggestions:${session.user.id}`, 15, 60_000);
  if (limited) return limited;

  const body = await request.json();
  const { niche, content_style, target_audience, unique_angle, content_topics } = body;

  const adjacentNiches = ADJACENT[niche] || [];

  const pool = getPool();

  // Find matching seed creators with their best hooks
  const { rows } = await pool.query(
    `WITH matched_creators AS (
      SELECT sc.username, sc.platform, sc.niche AS seed_niche,
             pr.id AS profile_id, pr.display_name, pr.avatar_url, pr.followers
      FROM seed_creators sc
      JOIN profiles pr ON pr.username = sc.username AND pr.platform = sc.platform
      WHERE sc.is_active = TRUE
        AND (sc.niche = $1 OR pr.primary_niche = $1 OR sc.niche = ANY($2::text[]))
        AND EXISTS (
          SELECT 1 FROM posts p WHERE p.profile_id = pr.id
            AND p.analyzed_at IS NOT NULL AND (p.hook_analysis->>'hook_score')::int >= 6
        )
      ORDER BY pr.followers DESC
      LIMIT 15
    ),
    ranked_hooks AS (
      SELECT mc.*, p.id AS post_id, p.views, p.viral_score, p.hook_analysis,
        ROW_NUMBER() OVER (PARTITION BY mc.profile_id ORDER BY (p.hook_analysis->>'hook_score')::int * p.viral_score DESC) AS rn
      FROM matched_creators mc
      JOIN posts p ON p.profile_id = mc.profile_id
      WHERE p.analyzed_at IS NOT NULL AND (p.hook_analysis->>'hook_score')::int >= 5
    )
    SELECT * FROM ranked_hooks WHERE rn <= 3 ORDER BY username, rn`,
    [niche, adjacentNiches]
  );

  // Group rows by creator
  const creatorsMap = new Map<string, {
    username: string;
    platform: string;
    display_name: string | null;
    avatar_url: string | null;
    followers: number;
    niche: string;
    hooks: SuggestionHook[];
  }>();

  for (const row of rows) {
    const key = `${row.username}:${row.platform}`;
    if (!creatorsMap.has(key)) {
      creatorsMap.set(key, {
        username: row.username,
        platform: row.platform,
        display_name: row.display_name,
        avatar_url: row.avatar_url,
        followers: row.followers,
        niche: row.seed_niche,
        hooks: [],
      });
    }
    const ha = typeof row.hook_analysis === 'string' ? JSON.parse(row.hook_analysis) : row.hook_analysis;
    creatorsMap.get(key)!.hooks.push({
      post_id: row.post_id,
      hook_template: ha?.hook_template || ha?.hook_text || '',
      hook_type: ha?.hook_type || 'unknown',
      hook_score: ha?.hook_score || 0,
      viral_score: row.viral_score || 0,
      views: row.views || 0,
    });
  }

  const candidates = Array.from(creatorsMap.values());

  if (candidates.length === 0) {
    return NextResponse.json({ suggestions: [] });
  }

  // Try DeepSeek to pick best matches and generate why_text
  const apiKey = process.env.DEEPSEEK_API_KEY;
  let aiPicks: { username: string; platform: string; why_text: string }[] | null = null;

  if (apiKey) {
    const candidateSummary = candidates.map(c => ({
      username: c.username,
      platform: c.platform,
      niche: c.niche,
      followers: c.followers,
      top_hooks: c.hooks.map(h => ({
        hook_type: h.hook_type,
        hook_template: h.hook_template,
        hook_score: h.hook_score,
      })),
    }));

    const prompt = `You are helping a new content creator find seed creators to study for hook inspiration.

Here's the user's profile:
- Niche: ${niche || 'not specified'}
- Content style: ${content_style || 'not specified'}
- Target audience: ${target_audience || 'not specified'}
- Unique angle/background: ${unique_angle || 'not specified'}
- Content topics: ${content_topics || 'not specified'}

Here are ${candidates.length} candidate creators with their best hooks:
${JSON.stringify(candidateSummary, null, 2)}

Pick the 5-8 best matches for this user. For each, write 2-3 sentences explaining WHY this creator's hook patterns are relevant to the user's specific background, story, or goals. Reference specific details from the user's profile and the creator's hook patterns.

Return ONLY a JSON array: [{ "username": "...", "platform": "...", "why_text": "..." }]`;

    try {
      const resp = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1024,
          temperature: 0.7,
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        let text = data.choices[0].message.content.trim();
        if (text.startsWith('```')) {
          text = text.split('\n').slice(1).join('\n');
          text = text.replace(/```\s*$/, '').trim();
        }
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed) && parsed.length > 0) {
          aiPicks = parsed;
        }
      } else {
        console.error('DeepSeek suggestions error:', resp.status);
      }
    } catch (e) {
      console.error('DeepSeek suggestions failed:', e);
    }
  }

  // Merge AI output with DB data
  let suggestions: CreatorSuggestion[];

  if (aiPicks) {
    suggestions = [];
    for (const pick of aiPicks) {
      const key = `${pick.username}:${pick.platform}`;
      const creator = creatorsMap.get(key);
      if (creator) {
        suggestions.push({
          username: creator.username,
          platform: creator.platform,
          display_name: creator.display_name,
          avatar_url: creator.avatar_url,
          followers: creator.followers,
          niche: creator.niche,
          why_text: pick.why_text || '',
          top_hooks: creator.hooks,
        });
      }
    }
  } else {
    // Fallback: return all candidates without AI reasoning
    suggestions = candidates.map(c => ({
      ...c,
      why_text: '',
      top_hooks: c.hooks,
    }));
  }

  return NextResponse.json({ suggestions });
}
