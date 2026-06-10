import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { enforceRateLimitFor } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = Number(session.user.id);
  const limited = enforceRateLimitFor(`generate-hooks:${userId}`, 15, 60_000);
  if (limited) return limited;

  const body = await request.json();
  const { topic, pattern_ids } = body;

  if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
    return NextResponse.json({ error: 'Topic is required' }, { status: 400 });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'DeepSeek API key not configured' }, { status: 500 });
  }

  const pool = getPool();

  // Get user's creator profile
  const profileRes = await pool.query(
    'SELECT * FROM creator_profiles WHERE user_id = $1',
    [userId]
  );
  const profile = profileRes.rows[0];
  if (!profile || profile.onboarding_step !== 'complete') {
    return NextResponse.json(
      { error: 'Complete your creator profile first' },
      { status: 400 }
    );
  }

  // Fetch saved patterns + example posts
  const conditions: string[] = ['usp.user_id = $1'];
  const params: (string | number | number[])[] = [userId];
  let paramIdx = 2;

  if (Array.isArray(pattern_ids) && pattern_ids.length > 0) {
    conditions.push(`hp.id = ANY($${paramIdx})`);
    params.push(pattern_ids);
    paramIdx++;
  }

  const hooksRes = await pool.query(`
    SELECT DISTINCT ON (p.id) p.id, p.description, p.hook_analysis, p.views, p.likes, p.viral_score,
           pr.username, pr.platform,
           hp.display_name AS pattern_name, hp.canonical_template, hp.hook_type, hp.niche
    FROM user_saved_patterns usp
    JOIN hook_patterns hp ON usp.pattern_id = hp.id
    JOIN hook_pattern_posts hpp ON hpp.pattern_id = hp.id
    JOIN posts p ON hpp.post_id = p.id
    JOIN profiles pr ON p.profile_id = pr.id
    WHERE ${conditions.join(' AND ')}
      AND p.hook_analysis IS NOT NULL
    ORDER BY p.id, p.viral_score DESC
    LIMIT 10
  `, params);

  const savedHooks = hooksRes.rows;
  if (savedHooks.length < 1) {
    return NextResponse.json(
      { error: 'Save at least 1 hook pattern to generate hooks' },
      { status: 400 }
    );
  }

  // Build hook examples text grouped by pattern
  const hookExamples = savedHooks.map((h: {
    hook_analysis: { hook_text?: string; hook_template?: string; hook_explanation?: string };
    username: string;
    platform: string;
    viral_score: number;
    pattern_name: string | null;
    canonical_template: string;
    hook_type: string | null;
    niche: string | null;
  }, i: number) => {
    const analysis = h.hook_analysis;
    return `${i + 1}. Style: ${h.hook_type || 'General'} | Pattern: "${h.pattern_name || h.canonical_template}"
   @${h.username} (${h.platform}, ${h.viral_score?.toFixed(1)}x viral)
   Hook text: "${analysis?.hook_text || 'N/A'}"
   Why it works: ${analysis?.hook_explanation || 'N/A'}`;
  }).join('\n\n');

  // Build background QA text
  const bgQA = profile.background_qa
    ? (profile.background_qa as { q: string; a: string }[]).map((qa: { q: string; a: string }) => `Q: ${qa.q}\nA: ${qa.a}`).join('\n\n')
    : 'No additional background provided';

  // Static system message — maximizes DeepSeek prefix caching
  const systemMessage = `You are a viral content strategist. A creator wants to make a video about a specific topic.
Using their saved hook styles as inspiration, generate 5 ready-to-film hook scripts
personalized to their background and the topic they provided.

Return a JSON object:
{
  "hooks": [
    {
      "script": "The exact opening line the creator should say on camera. 1-3 sentences, ready to film.",
      "hook_style": "Name of the hook style used (e.g. Curiosity Gap, Visual Spectacle)",
      "inspired_by": "Which saved hook pattern inspired this",
      "why": "One sentence on why this hook works for this topic + creator"
    }
  ]
}

Generate exactly 5 hooks using different styles. Make them specific and concrete — no placeholders.
Return ONLY the JSON object.`;

  // Dynamic user message
  const userMessage = `TOPIC: ${topic.trim()}

CREATOR PROFILE:
- Niche: ${profile.niche || 'not specified'}
- Content style: ${profile.content_style || 'not specified'}
- Target audience: ${profile.target_audience || 'not specified'}
- Unique angle/background: ${profile.unique_angle || 'not specified'}
- Platforms: ${profile.platforms || 'not specified'}

CREATOR BACKGROUND:
${bgQA}

HOOK STYLES TO DRAW FROM:
${hookExamples}`;

  try {
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userMessage },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('DeepSeek API error:', errText.slice(0, 300));
      return NextResponse.json({ error: 'AI generation failed' }, { status: 500 });
    }

    const data = await resp.json();
    const text = data.choices[0].message.content.trim();
    const generated = JSON.parse(text);

    return NextResponse.json({ hooks: generated.hooks || [] });
  } catch (e) {
    console.error('Generate hooks error:', e);
    return NextResponse.json({ error: 'Failed to generate hooks' }, { status: 500 });
  }
}
