import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = Number(session.user.id);
  const body = await request.json();
  const { hook_type, niche, section_id } = body;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
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

  // Get hooks from user_hooks → user_hook_examples → posts
  const conditions: string[] = ['uh.user_id = $1'];
  const params: (string | number)[] = [userId];
  let paramIdx = 2;

  if (targetType) {
    conditions.push(`(uh.hook_type = $${paramIdx} OR p.hook_analysis->>'hook_type' = $${paramIdx})`);
    params.push(targetType);
    paramIdx++;
  }
  if (targetNiche) {
    conditions.push(`(uh.niche = $${paramIdx} OR p.hook_analysis->>'niche' = $${paramIdx})`);
    params.push(targetNiche);
    paramIdx++;
  }

  const hooksRes = await pool.query(`
    SELECT DISTINCT ON (p.id) p.id, p.description, p.hook_analysis, p.views, p.likes, p.viral_score,
           pr.username, pr.platform
    FROM user_hooks uh
    JOIN user_hook_examples uhe ON uhe.user_hook_id = uh.id
    JOIN posts p ON uhe.post_id = p.id
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

  const prompt = `You are a viral content strategist helping a creator build a personalized hook playbook.

CREATOR PROFILE:
- Niche: ${profile.niche || 'not specified'}
- Content style: ${profile.content_style || 'not specified'}
- Target audience: ${profile.target_audience || 'not specified'}
- Unique angle/background: ${profile.unique_angle || 'not specified'}
- Platforms: ${profile.platforms ? JSON.parse(profile.platforms).join(', ') : 'not specified'}

CREATOR BACKGROUND:
${bgQA}

SAVED HOOKS (${sectionLabel}):
${hookExamples}

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

Generate exactly 3 templates in the templates array. Make them specific to the creator's niche, angle, and audience. Use details from their background answers.

Return ONLY the JSON object, no other text.`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('Claude API error:', errText.slice(0, 300));
      return NextResponse.json({ error: 'AI generation failed' }, { status: 500 });
    }

    const data = await resp.json();
    let text = data.content[0].text.trim();

    // Parse JSON from response (handle markdown code blocks)
    if (text.startsWith('```')) {
      text = text.split('\n').slice(1).join('\n');
      text = text.replace(/```$/, '').trim();
    }

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
