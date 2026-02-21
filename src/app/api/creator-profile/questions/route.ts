import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { niche, content_style, target_audience, unique_angle, content_topics } = body;

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.error('DEEPSEEK_API_KEY not set — cannot generate questions');
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  const prompt = `Generate exactly 3 personalized follow-up questions for a content creator. These help personalize viral hook templates for their short-form videos.

Creator: ${niche || '?'} niche, ${content_style || '?'} style, audience: ${target_audience || '?'}, angle: ${unique_angle || '?'}, topics: ${content_topics || '?'}

Questions should cover: 1) what makes them the right person to talk about this (keep it casual, not "credentials") 2) a story or experience from their journey that their audience would relate to 3) what they wish more people understood about their topic.

Keep questions conversational and easy to answer — like a friend asking, not a job interview. Reference their niche/topics so it feels personal. Return ONLY a JSON array of 3 strings.`;

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
        max_tokens: 512,
        temperature: 0.7,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('DeepSeek API error:', resp.status, errText.slice(0, 500));
      return NextResponse.json({ error: 'AI generation failed', status: resp.status }, { status: 500 });
    }

    const data = await resp.json();
    let text = data.choices[0].message.content.trim();

    // Parse JSON from response (handle markdown code blocks)
    if (text.startsWith('```')) {
      text = text.split('\n').slice(1).join('\n');
      text = text.replace(/```\s*$/, '').trim();
    }

    const questions = JSON.parse(text);

    if (!Array.isArray(questions) || questions.length === 0) {
      console.error('DeepSeek returned non-array or empty:', text.slice(0, 200));
      return NextResponse.json({ error: 'Invalid response format' }, { status: 500 });
    }

    return NextResponse.json({ questions });
  } catch (e) {
    console.error('Question generation error:', e);
    return NextResponse.json({ error: 'Failed to generate questions' }, { status: 500 });
  }
}
