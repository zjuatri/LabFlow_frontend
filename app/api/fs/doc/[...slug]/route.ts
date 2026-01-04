import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const DOCS_ROOT = process.env.DOCS_PATH ? path.resolve(process.env.DOCS_PATH) : path.join(process.cwd(), 'docs');

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ slug: string[] }> }
) {
    try {
        // slug is array, e.g. ['folder', 'doc']
        const resolvedParams = await params;
        const relPath = resolvedParams.slug.join('/');
        const fullPath = path.join(DOCS_ROOT, `${relPath}.md`);

        // Check if file exists

        if (!fs.existsSync(fullPath)) {
            // Try index.md if it's a folder?
            const indexPath = path.join(DOCS_ROOT, relPath, 'index.md');
            if (fs.existsSync(indexPath)) {
                const fileContent = fs.readFileSync(indexPath, 'utf-8');
                const { data, content } = matter(fileContent);
                return NextResponse.json({
                    title: data.title,
                    content,
                    slug: relPath,
                    is_published: true // Default to true for FS
                });
            }
            return NextResponse.json({
                error: 'Not found',
                debug: {
                    triedPath: fullPath,
                    relPath,
                    docsRoot: DOCS_ROOT,
                    cwd: process.cwd()
                }
            }, { status: 404 });
        }

        const fileContent = fs.readFileSync(fullPath, 'utf-8');
        const { data, content } = matter(fileContent);
        const stats = fs.statSync(fullPath);

        return NextResponse.json({
            id: relPath, // Use path as ID
            title: data.title,
            slug: relPath,
            content,
            is_published: true,
            created_at: stats.birthtime.toISOString(),
            updated_at: stats.mtime.toISOString()
        });

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
    }
}
