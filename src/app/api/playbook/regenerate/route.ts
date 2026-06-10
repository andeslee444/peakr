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
  const limited = enforceRateLimitFor(`regenerate:${userId}`, 15, 60_000);
  if (limited) return limited;

  const body = await request.json();
  const { hook_type, niche, section_id } = body;

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

  // Determine which hook_type/niche to generate for
  let targetType = hook_type;
  let targetNiche = niche;

  // If regenerating existing section, use its type/niche
  if (section_id) {
    const sectionRes = await pool.query(
      'SELECT * FROM playbook_sections WHERE id = $1 AND user_id = $2',
      [section_id, userId]
    );
    if (sectionRes.rows[0]) {
      targetType = sectionRes.rows[0].hook_type;
      targetNiche = sectionRes.rows[0].niche;
    }
  }

  if (!targetType && !targetNiche) {
    return NextResponse.json(
      { error: 'hook_type or niche required' },
      { status: 400 }
    );
  }

  // Get hooks from user_saved_patterns → hook_patterns → hook_pattern_posts → posts
  const conditions: string[] = ['usp.user_id = $1'];
  const params: (string | number)[] = [userId];
  let paramIdx = 2;

  if (targetType) {
    conditions.push(`(hp.hook_type = $${paramIdx} OR p.hook_analysis->>'hook_type' = $${paramIdx})`);
    params.push(targetType);
    paramIdx++;
  }
  if (targetNiche) {
    conditions.push(`(hp.niche = $${paramIdx} OR p.hook_analysis->>'niche' = $${paramIdx})`);
    params.push(targetNiche);
    paramIdx++;
  }

  const hooksRes = await pool.query(`
    SELECT DISTINCT ON (p.id) p.id, p.description, p.hook_analysis, p.views, p.likes, p.viral_score,
           pr.username, pr.platform
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
      { error: 'Save at least 1 hook of this type to generate templates' },
      { status: 400 }
    );
  }

  // Build the hook examples text
  const hookExamples = savedHooks.map((h: { hook_analysis: { hook_text?: string; hook_template?: string; hook_explanation?: string }; username: string; platform: string; viral_score: number }, i: number) => {
    const analysis = h.hook_analysis;
    return `${i + 1}. @${h.username} (${h.platform}, viral score: ${h.viral_score?.toFixed(1)}x)
   Hook text: "${analysis?.hook_text || 'N/A'}"
   Template: "${analysis?.hook_template || 'N/A'}"
   Why it works: ${analysis?.hook_explanation || 'N/A'}`;
  }).join('\n\n');

  // Build background QA text
  const bgQA = profile.background_qa
    ? (profile.background_qa as { q: string; a: string }[]).map((qa: { q: string; a: string }) => `Q: ${qa.q}\nA: ${qa.a}`).join('\n\n')
    : 'No additional background provided';

  const sectionLabel = [targetType, targetNiche].filter(Boolean).join(' + ');

  // Static system message — identical across all calls, maximizes DeepSeek prefix caching
  const systemMessage = `You are a viral content strategist helping a creator build a personalized hook playbook.

Based on the hooks this creator saved and their unique background, generate a playbook section.

Return a JSON object with these fields:
{
  "title": "Section title like 'Curiosity Gap Hooks for Fitness'",
  "templates": [
    {
      "script": "A complete hook script template with [bracketed placeholders] personalized to the creator's background. 1-3 sentences.",
      "example_filled": "The same template but filled in with a concrete example based on the creator's profile."
    }
  ],
  "why_it_works": "2-3 sentences explaining why these hooks work especially well for THIS creator given their background and audience."
}

Generate exactly 3 templates. Make them specific to the creator's niche, angle, and audience.
Return ONLY the JSON object, no other text.`;

  // Dynamic user message — varies per call
  const userMessage = `CREATOR PROFILE:
- Niche: ${profile.niche || 'not specified'}
- Content style: ${profile.content_style || 'not specified'}
- Target audience: ${profile.target_audience || 'not specified'}
- Unique angle/background: ${profile.unique_angle || 'not specified'}
- Platforms: ${profile.platforms || 'not specified'}

CREATOR BACKGROUND:
${bgQA}

SAVED HOOKS (${sectionLabel}):
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
    const sourcePostIds = savedHooks.map((h: { id: number }) => h.id);

    // Upsert the playbook section
    if (section_id) {
      // Update existing section
      await pool.query(`
        UPDATE playbook_sections
        SET title = $1, templates = $2, source_post_ids = $3,
            why_it_works = $4, generated_at = NOW(), updated_at = NOW()
        WHERE id = $5 AND user_id = $6
      `, [
        generated.title,
        JSON.stringify(generated.templates),
        JSON.stringify(sourcePostIds),
        generated.why_it_works,
        section_id,
        userId,
      ]);
    } else {
      // Check if section exists for this user + hook_type + niche
      const existingRes = await pool.query(`
        SELECT id FROM playbook_sections
        WHERE user_id = $1
          AND COALESCE(hook_type, '') = COALESCE($2, '')
          AND COALESCE(niche, '') = COALESCE($3, '')
      `, [userId, targetType || null, targetNiche || null]);

      if (existingRes.rows.length > 0) {
        await pool.query(`
          UPDATE playbook_sections
          SET title = $1, templates = $2, source_post_ids = $3,
              why_it_works = $4, generated_at = NOW(), updated_at = NOW()
          WHERE id = $5
        `, [
          generated.title,
          JSON.stringify(generated.templates),
          JSON.stringify(sourcePostIds),
          generated.why_it_works,
          existingRes.rows[0].id,
        ]);
      } else {
        await pool.query(`
          INSERT INTO playbook_sections (user_id, title, hook_type, niche, templates, source_post_ids, why_it_works, generated_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        `, [
          userId,
          generated.title,
          targetType || null,
          targetNiche || null,
          JSON.stringify(generated.templates),
          JSON.stringify(sourcePostIds),
          generated.why_it_works,
        ]);
      }
    }

    // Return the updated section
    const updatedRes = await pool.query(`
      SELECT * FROM playbook_sections
      WHERE user_id = $1
      ORDER BY updated_at DESC
    `, [userId]);

    return NextResponse.json({ sections: updatedRes.rows, generated });
  } catch (e) {
    console.error('Playbook generation error:', e);
    return NextResponse.json({ error: 'Failed to generate playbook' }, { status: 500 });
  }
}
