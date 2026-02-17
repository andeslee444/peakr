import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

interface ExportRow {
  [key: string]: string | number | null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'csv';

    const db = getDb();
    const rows = db.prepare(`
      SELECT pr.username, pr.platform, pr.followers, pr.following,
             p.description, p.views, p.likes, p.comments, p.shares,
             p.viral_score, p.post_url, p.posted_at, p.thumbnail_url
      FROM posts p
      JOIN profiles pr ON p.profile_id = pr.id
      ORDER BY p.viral_score DESC
    `).all() as ExportRow[];

    if (format === 'csv') {
      const headers = ['username', 'platform', 'followers', 'following', 'description', 'views', 'likes', 'comments', 'shares', 'viral_score', 'post_url', 'posted_at'];
      const csvRows = [headers.join(',')];
      for (const row of rows) {
        csvRows.push(headers.map(h => {
          const val = row[h] ?? '';
          const str = String(val).replace(/"/g, '""');
          return str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r') ? `"${str}"` : str;
        }).join(','));
      }
      const csv = csvRows.join('\n');
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename=peakr-export.csv',
        },
      });
    }

    // JSON fallback
    return NextResponse.json({ rows });
  } catch {
    return NextResponse.json({ error: 'Failed to export data' }, { status: 500 });
  }
}
