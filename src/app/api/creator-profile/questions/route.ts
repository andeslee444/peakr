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

  const prompt = `You are helping someone who wants to start creating short-form content but hasn't started yet (or is very early). They have life experience and stories worth sharing — they just don't know which ones are content-worthy yet. Your job is to uncover their best material.

Here's what they told us:
- Niche/topic: ${niche || 'not specified'}
- Content style: ${content_style || 'not specified'}
- Target audience: ${target_audience || 'not specified'}
- Unique angle/background: ${unique_angle || 'not specified'}
- Content topics: ${content_topics || 'not specified'}

Generate exactly 3 personalized questions covering these dimensions (one each):

1. TURNING POINT — Ask about the specific moment or experience that made them care about ${niche || 'this topic'}. Not "why are you interested" but "what happened to you?" Everyone has a story — give a brief example relevant to their niche to spark their memory.

2. UNPOPULAR TAKE — Ask what opinion they hold about ${content_topics || niche || 'their topic'} that most people would disagree with or be surprised by. Frame it as "what do you know from experience that goes against the common advice?" Contrarian views make the best hooks for ${target_audience || 'their audience'}.

3. MISTAKES & LESSONS — Ask about a mistake they made, money they wasted, or wrong path they took related to ${niche || 'their field'}. "I wish someone told me..." stories are the most relatable content for ${target_audience || 'beginners'}. Give a niche-specific example to help them think of one.

Make each question feel like a friend brainstorming content ideas over coffee. Reference their specific niche, topics, and audience so it feels personal — not generic. Include a brief example with each question to show what kind of answer you're looking for.

Return ONLY a JSON array of 3 strings.`;

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
