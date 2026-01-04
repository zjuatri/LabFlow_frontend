import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const DOCS_ROOT = process.env.DOCS_PATH ? path.resolve(process.env.DOCS_PATH) : path.join(process.cwd(), 'docs');

type NavItem = {
    title: string;
    url?: string;
    slug?: string;
    path?: string;
    items?: NavItem[];
};

type MetaEntry = string | { title?: string };
type Meta = Record<string, MetaEntry>;

// Helper to recursively scan directory and build NavItem structure
function scanForStructure(dirPath: string, relativePath: string = ''): NavItem[] {
    if (!fs.existsSync(dirPath)) return [];

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const items: NavItem[] = [];

    // Read _meta.json for ordering and titles
    let meta: Meta = {};
    const metaPath = path.join(dirPath, '_meta.json');
    if (fs.existsSync(metaPath)) {
        try {
            meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as Meta;
        } catch (e) {
            console.error('Failed to parse _meta.json', e);
        }
    }

    for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name.startsWith('_') || entry.name === 'images') continue;

        const fullPath = path.join(dirPath, entry.name);
        const entryRelativePath = path.join(relativePath, entry.name).replace(/\\/g, '/');

        const item: NavItem = {
            title: entry.name,
            slug: entry.name,
            path: entryRelativePath,
            // If it's in meta, use that title/order
        };

        // Check meta for title
        const metaKey = entry.name.replace(/\.mdx?$/, '');
        if (meta[metaKey]) {
            const metaValue = meta[metaKey];
            if (typeof metaValue === 'string') {
                item.title = metaValue;
            } else if (typeof metaValue === 'object' && metaValue) {
                item.title = metaValue.title || item.title;
            }
        }

        if (entry.isDirectory()) {
            item.items = scanForStructure(fullPath, entryRelativePath);
            // If folder has index.md, it could be a doc too, but for sidebar structure we usually treat folders as containers
            // unless we want clickable folders.
            // For now, let's assume folders are just containers in the sidebar editor.
        } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.mdx'))) {
            // It's a document
            item.url = `/docs/${entryRelativePath.replace(/\.mdx?$/, '')}`;

            // Try to read title from frontmatter if not in meta
            if (!meta[metaKey]) {
                try {
                    const fileContent = fs.readFileSync(fullPath, 'utf-8');
                    const { data } = matter(fileContent);
                    if (data.title) item.title = data.title;
                } catch { }
            }
        } else {
            continue;
        }

        items.push(item);
    }

    // Sort based on meta keys order if available
    if (Object.keys(meta).length > 0) {
        const metaKeys = Object.keys(meta);
        items.sort((a, b) => {
            const aKey = (a.slug || a.path || a.url || a.title).replace(/\.mdx?$/, '');
            const bKey = (b.slug || b.path || b.url || b.title).replace(/\.mdx?$/, '');
            const aIndex = metaKeys.indexOf(aKey);
            const bIndex = metaKeys.indexOf(bKey);

            if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
            if (aIndex !== -1) return -1;
            if (bIndex !== -1) return 1;
            return a.title.localeCompare(b.title);
        });
    } else {
        items.sort((a, b) => {
            if (a.items && !b.items) return -1; // Folders first
            if (!a.items && b.items) return 1;
            return a.title.localeCompare(b.title);
        });
    }

    return items;
}

export async function GET() {
    try {
        if (!fs.existsSync(DOCS_ROOT)) {
            fs.mkdirSync(DOCS_ROOT, { recursive: true });
        }

        // Seeding logic: If DOCS_ROOT is empty and we are using a custom DOCS_PATH (Docker)
        // Copy original docs from inside the build if they exist
        const internalDocsBackup = path.join(process.cwd(), 'docs');
        const isCustomPath = process.env.DOCS_PATH && path.resolve(process.env.DOCS_PATH) === DOCS_ROOT;

        if (isCustomPath && fs.readdirSync(DOCS_ROOT).length === 0 && fs.existsSync(internalDocsBackup)) {
            console.log('Seeding DOCS_ROOT from internal backup...');
            const copyRecursive = (src: string, dest: string) => {
                const stats = fs.statSync(src);
                if (stats.isDirectory()) {
                    if (!fs.existsSync(dest)) fs.mkdirSync(dest);
                    fs.readdirSync(src).forEach((childItemName) => {
                        copyRecursive(path.join(src, childItemName), path.join(dest, childItemName));
                    });
                } else {
                    fs.copyFileSync(src, dest);
                }
            };
            copyRecursive(internalDocsBackup, DOCS_ROOT);
        }

        const structure = scanForStructure(DOCS_ROOT);
        return NextResponse.json(structure);
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Failed to scan docs' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    // Handle structure updates
    try {
        const structure = (await req.json()) as NavItem[];

        // Recursive function to write _meta.json
        function writeMeta(items: NavItem[], dirPath: string) {
            if (!fs.existsSync(dirPath)) return;

            const meta: Record<string, string> = {};

            items.forEach(item => {
                // item.slug is the filename/foldername
                // item.title is the display title
                // Fall back to path or url if slug is not available
                let key = item.slug;
                if (!key && item.path) {
                    // Extract last segment from path
                    key = item.path.split('/').pop() || item.path;
                }
                if (!key && item.url) {
                    // Extract last segment from url (e.g., /docs/foo/bar -> bar)
                    key = item.url.split('/').pop() || item.url;
                }
                if (!key) {
                    // Skip items without identifiable key
                    console.warn('Skipping item without slug/path/url:', item);
                    return;
                }

                key = key.replace(/\.mdx?$/, '');
                meta[key] = item.title;

                if (item.items && item.items.length > 0) {
                    // It's a folder, recurse
                    const subDirPath = path.join(dirPath, key);
                    writeMeta(item.items, subDirPath);
                }
            });

            fs.writeFileSync(path.join(dirPath, '_meta.json'), JSON.stringify(meta, null, 2));
        }

        writeMeta(structure, DOCS_ROOT);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Failed to save structure' }, { status: 500 });
    }
}
