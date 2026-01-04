import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const DOCS_ROOT = process.env.DOCS_PATH ? path.resolve(process.env.DOCS_PATH) : path.join(process.cwd(), 'docs');

export async function POST(req: Request) {
    try {
        const { title, slug, content, isFolder, parentPath } = await req.json();

        // Construct target path
        // parentPath should be relative to DOCS_ROOT, e.g. "folder1/subfolder"
        // slug is the filename/foldername

        let targetDir = DOCS_ROOT;
        if (parentPath) {
            targetDir = path.join(DOCS_ROOT, parentPath);
        }

        if (!fs.existsSync(targetDir)) {
            return NextResponse.json({ error: 'Parent directory does not exist' }, { status: 404 });
        }

        if (isFolder) {
            const folderPath = path.join(targetDir, slug);
            if (fs.existsSync(folderPath)) {
                return NextResponse.json({ error: 'Folder already exists' }, { status: 400 });
            }
            fs.mkdirSync(folderPath);

            // Create _meta.json
            fs.writeFileSync(path.join(folderPath, '_meta.json'), JSON.stringify({}, null, 2));

            return NextResponse.json({ success: true, path: path.relative(DOCS_ROOT, folderPath) });
        } else {
            // Create File
            const fileName = slug.endsWith('.md') ? slug : `${slug}.md`;
            const filePath = path.join(targetDir, fileName);

            if (fs.existsSync(filePath)) {
                return NextResponse.json({ error: 'File already exists' }, { status: 400 });
            }

            const fileContent = matter.stringify(content || '', {
                title: title || slug,
                date: new Date().toISOString()
            });

            fs.writeFileSync(filePath, fileContent);

            return NextResponse.json({
                id: path.relative(DOCS_ROOT, filePath).replace(/\\/g, '/').replace(/\.md$/, ''),
                title: title || slug,
                slug: path.relative(DOCS_ROOT, filePath).replace(/\\/g, '/').replace(/\.md$/, ''),
                content: content || '',
                is_published: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
        }

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Failed to create' }, { status: 500 });
    }
}

export async function PUT(req: Request) {
    try {
        const { oldPath, newPath, content, title } = await req.json();
        // oldPath: relative path like "folder/doc.md"

        let fullOldPath = path.join(DOCS_ROOT, oldPath);

        if (!fs.existsSync(fullOldPath)) {
            // Try adding .md if not found
            if (fs.existsSync(fullOldPath + '.md')) {
                fullOldPath += '.md';
            } else if (fs.existsSync(fullOldPath + '.mdx')) {
                fullOldPath += '.mdx';
            } else {
                // Could be a folder rename?
                if (!fs.existsSync(fullOldPath)) {
                    console.log('Update failed, file not found:', fullOldPath);
                    return NextResponse.json({ error: 'File not found' }, { status: 404 });
                }
            }
        }

        // Update content/frontmatter
        if (content !== undefined || title !== undefined) {
            const fileContent = fs.readFileSync(fullOldPath, 'utf-8');
            const parsed = matter(fileContent);

            if (content !== undefined) parsed.content = content;
            if (title !== undefined) parsed.data.title = title;

            const newFileContent = matter.stringify(parsed.content, parsed.data);
            fs.writeFileSync(fullOldPath, newFileContent);
        }

        // Rename/Move
        if (newPath && newPath !== oldPath) {
            let fullNewPath = path.join(DOCS_ROOT, newPath);

            // Preserve extension if missing in newPath
            const oldExt = path.extname(fullOldPath);
            if (oldExt && !path.extname(fullNewPath)) {
                fullNewPath += oldExt;
            }

            // Ensure target dir exists
            const targetDir = path.dirname(fullNewPath);
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }
            fs.renameSync(fullOldPath, fullNewPath);
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const { path: relPath } = await req.json();
        const fullPath = path.join(DOCS_ROOT, relPath);

        if (fs.existsSync(fullPath)) {
            fs.rmSync(fullPath, { recursive: true, force: true });
            return NextResponse.json({ success: true });
        } else {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    }
}
