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
  const limited = enforceRateLimitFor(`remix:${userId}`, 20, 60_000);
  if (limited) return limited;

  const body = await request.json();
  const { pattern_id } = body;

  if (!pattern_id) {
    return NextResponse.json({ error: 'pattern_id is required' }, { status: 400 });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'DeepSeek API key not configured' }, { status: 500 });
  }

  const pool = getPool();

  // Get creator profile
  const { rows: [profile] } = await pool.query(
    'SELECT * FROM creator_profiles WHERE user_id = $1',
    [userId]
  );
  if (!profile || profile.onboarding_step !== 'complete') {
    return NextResponse.json({ error: 'Complete your creator profile first' }, { status: 400 });
  }

  // Get the pattern and its best examples
  const { rows: [pattern] } = await pool.query(`
    SELECT hp.id, hp.canonical_template, hp.display_name, hp.hook_type, hp.niche,
           hp.avg_viral_score, hp.example_count
    FROM hook_patterns hp
    JOIN user_saved_patterns usp ON usp.pattern_id = hp.id
    WHERE hp.id = $1 AND usp.user_id = $2
  `, [pattern_id, userId]);

  if (!pattern) {
    return NextResponse.json({ error: 'Pattern not found' }, { status: 404 });
  }

  // Get top 5 example posts for this pattern
  const { rows: examples } = await pool.query(`
    SELECT p.hook_analysis, p.viral_score, p.views, pr.username, pr.platform
    FROM hook_pattern_posts hpp
    JOIN posts p ON hpp.post_id = p.id
    JOIN profiles pr ON p.profile_id = pr.id
    WHERE hpp.pattern_id = $1
    ORDER BY p.viral_score DESC
    LIMIT 5
  `, [pattern_id]);

  const exampleTexts = examples.map((ex: {
    hook_analysis: { hook_text?: string; hook_explanation?: string } | null;
    username: string;
    platform: string;
    viral_score: number;
  }, i: number) => {
    const a = ex.hook_analysis;
    return `${i + 1}. @${ex.username} (${ex.platform}, ${ex.viral_score?.toFixed(1)}x viral)
   "${a?.hook_text || 'N/A'}"
   Why it worked: ${a?.hook_explanation || 'N/A'}`;
  }).join('\n\n');

  const bgQA = profile.background_qa
    ? (profile.background_qa as { q: string; a: string }[]).map((qa: { q: string; a: string }) => `Q: ${qa.q}\nA: ${qa.a}`).join('\n\n')
    : '';

  const systemMessage = `You are a viral content strategist specializing in hook adaptation.
A creator has saved a hook pattern that works well for other creators. Your job is to generate 5 variations of this hook pattern adapted specifically for THEIR niche, audience, and style.

The variations should:
- Keep the same psychological structure (the "why it works")
- Adapt the topic/subject to the creator's niche
- Use language natural to the creator's style
- Be ready-to-film opening lines (1-3 sentences each)
- Each use a slightly different angle or topic within the creator's niche

Return a JSON object:
{
  "variations": [
    {
      "script": "The exact opening line adapted for this creator. Ready to say on camera.",
      "angle": "Brief description of the angle/topic (3-5 words)",
      "why": "One sentence on why this adaptation works"
    }
  ]
}

Generate exactly 5 variations. Make them specific and concrete — no placeholders or brackets.
Return ONLY the JSON object.`;

  const userMessage = `HOOK PATTERN TO ADAPT:
Template: "${pattern.display_name || pattern.canonical_template}"
Hook Type: ${pattern.hook_type || 'General'}
Original Niche: ${pattern.niche || 'General'}
Avg Viral Score: ${pattern.avg_viral_score?.toFixed(1)}x

EXAMPLES OF THIS PATTERN IN ACTION:
${exampleTexts}

ADAPT FOR THIS CREATOR:
- Niche: ${profile.niche || 'not specified'}
- Content style: ${profile.content_style || 'not specified'}
- Target audience: ${profile.target_audience || 'not specified'}
- Unique angle: ${profile.unique_angle || 'not specified'}
${bgQA ? `\nBACKGROUND:\n${bgQA}` : ''}`;

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
      console.error('DeepSeek remix error:', errText.slice(0, 300));
      return NextResponse.json({ error: 'AI generation failed' }, { status: 500 });
    }

    const data = await resp.json();
    const text = data.choices[0].message.content.trim();
    const generated = JSON.parse(text);

    return NextResponse.json({
      pattern_name: pattern.display_name || pattern.canonical_template,
      variations: generated.variations || [],
    });
  } catch (e) {
    console.error('Remix error:', e);
    return NextResponse.json({ error: 'Failed to generate variations' }, { status: 500 });
  }
}
