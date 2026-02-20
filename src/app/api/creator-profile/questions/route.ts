import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { niche, content_style, target_audience, unique_angle } = body;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  const prompt = `You are helping a content creator build their profile for a hook intelligence platform. Based on their answers below, generate 4-5 tailored follow-up questions to understand their unique background, expertise, and story. These answers will be used to personalize hook templates for their content.

Creator info:
- Niche: ${niche || 'not specified'}
- Content style: ${content_style || 'not specified'}
- Target audience: ${target_audience || 'not specified'}
- Unique angle/background: ${unique_angle || 'not specified'}

Generate questions that dig into:
1. Their specific expertise or credentials within the niche
2. A personal transformation or journey they've been through
3. A common myth or misconception in their field that frustrates them
4. A surprising or memorable story from their experience
5. What their audience values most from their content

Return a JSON array of question strings, like:
["Question 1?", "Question 2?", "Question 3?", "Question 4?"]

Return ONLY the JSON array, no other text.`;

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
        max_tokens: 512,
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

    const questions = JSON.parse(text);
    return NextResponse.json({ questions });
  } catch (e) {
    console.error('Question generation error:', e);
    return NextResponse.json({ error: 'Failed to generate questions' }, { status: 500 });
  }
}
