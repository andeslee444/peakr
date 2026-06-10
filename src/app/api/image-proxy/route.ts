import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { assertSafeUrl, UnsafeUrlError, INSTAGRAM_IMAGE_HOSTS } from '@/lib/ssrf';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = req.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'Missing url param' }, { status: 400 });
  }

  let safe: URL;
  try {
    safe = assertSafeUrl(url, INSTAGRAM_IMAGE_HOSTS);
  } catch (e) {
    if (e instanceof UnsafeUrlError) {
      return NextResponse.json({ error: 'URL not allowed' }, { status: 400 });
    }
    throw e;
  }

  try {
    const res = await fetch(safe.toString(), {
      // Do not follow redirects: a redirect to an internal host would bypass
      // the allowlist. Allowlisted CDN image URLs are served directly.
      redirect: 'error',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.instagram.com/',
      },
    });

    if (!res.ok) {
      return new NextResponse(null, { status: 502 });
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return new NextResponse(null, { status: 502 });
    }
    const buffer = await res.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
