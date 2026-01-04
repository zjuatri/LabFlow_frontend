import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

// ============================================================================
// Types
// ============================================================================

export interface DocMeta {
    title: string;
    slug: string;
    order?: number;
    description?: string;
}

export interface DocNode {
    title: string;
    slug: string;
    path: string;      // URL path: /docs/getting-started
    isFolder: boolean;
    children?: DocNode[];
    order?: number;
}

export interface DocContent {
    meta: DocMeta;
    content: string;
    isFolder?: boolean;
    children?: DocNode[];
}

// FolderMeta interface removed

// ============================================================================
// Constants
// ============================================================================

const DOCS_ROOT = process.env.DOCS_PATH ? path.resolve(process.env.DOCS_PATH) : path.join(process.cwd(), 'docs');

// ============================================================================
// Helpers
// ============================================================================

// function readFolderMeta(folderPath: string): FolderMeta { ... } // Removed


/**
 * Convert filename to human-readable title
 * e.g., "quick-start.md" -> "Quick Start"
 */
function filenameToTitle(filename: string): string {
    const name = filename.replace(/\.md$/, '');
    return name
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Recursively scan directory and build navigation tree
 */
function scanDirectory(dirPath: string, urlPrefix: string = '/docs'): DocNode[] {
    if (!fs.existsSync(dirPath)) {
        return [];
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const nodes: DocNode[] = [];

    // Read _meta.json in the current directory to determine order and titles
    let meta: Record<string, { title?: string } | string | undefined> = {};
    const metaPath = path.join(dirPath, '_meta.json');
    if (fs.existsSync(metaPath)) {
        try {
            meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        } catch {
            meta = {};
        }
    }

    for (const entry of entries) {
        // Skip hidden files and _meta.json
        if (entry.name.startsWith('.') || entry.name.startsWith('_') || entry.name === 'images') {
            continue;
        }

        const fullPath = path.join(dirPath, entry.name);
        const slug = entry.name.replace(/\.md$/, '');

        // Determine title from meta or filename
        const metaVal = meta[slug];
        let title: string | undefined;

        if (typeof metaVal === 'string') {
            title = metaVal;
        } else if (typeof metaVal === 'object' && metaVal !== null) {
            title = metaVal.title;
        }

        if (!title) {
            title = filenameToTitle(entry.name);
        }

        if (entry.isDirectory()) {
            // It's a folder
            const folderUrlPath = `${urlPrefix}/${slug}`;
            const children = scanDirectory(fullPath, folderUrlPath);

            nodes.push({
                title,
                slug,
                path: folderUrlPath,
                isFolder: true,
                children: children.length > 0 ? children : undefined,
            });
        } else if (entry.name.endsWith('.md')) {
            // It's a markdown file
            // If title wasn't in meta, try frontmatter
            if (!meta[slug]) {
                try {
                    const fileContent = fs.readFileSync(fullPath, 'utf-8');
                    const { data } = matter(fileContent);
                    if (data.title) title = data.title;
                } catch { }
            }

            nodes.push({
                title: title || filenameToTitle(entry.name),
                slug,
                path: `${urlPrefix}/${slug}`,
                isFolder: false,
            });
        }
    }

    // Sort based on meta keys order
    if (Object.keys(meta).length > 0) {
        const metaKeys = Object.keys(meta);
        nodes.sort((a, b) => {
            const aIndex = metaKeys.indexOf(a.slug);
            const bIndex = metaKeys.indexOf(b.slug);

            if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
            if (aIndex !== -1) return -1;
            if (bIndex !== -1) return 1;
            return a.title.localeCompare(b.title);
        });
    } else {
        // Default sort: Folders first, then alphabetical
        nodes.sort((a, b) => {
            if (a.isFolder && !b.isFolder) return -1;
            if (!a.isFolder && b.isFolder) return 1;
            return a.title.localeCompare(b.title);
        });
    }

    return nodes;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get the full documentation tree for sidebar navigation
 */
export function getDocTree(): DocNode[] {
    return scanDirectory(DOCS_ROOT);
}

/**
 * Get a default document path to land on (first markdown leaf), for setups
 * that don't want a dedicated /docs homepage.
 */
export function getDefaultDocPath(): string | null {
    const tree = scanDirectory(DOCS_ROOT);

    const findFirstLeaf = (nodes: DocNode[]): DocNode | null => {
        for (const node of nodes) {
            if (!node.isFolder) return node;
            if (node.children && node.children.length > 0) {
                const leaf = findFirstLeaf(node.children);
                if (leaf) return leaf;
            }
        }
        return null;
    };

    const firstLeaf = findFirstLeaf(tree);
    return firstLeaf ? firstLeaf.path : null;
}

/**
 * Get document content and metadata by slug path
 * @param slugPath Array of path segments, e.g., ['getting-started', 'installation']
 */
export function getDocBySlug(slugPath: string[]): DocContent | null {
    // MkDocs-like behavior: treat docs/README.md as the home page when visiting /docs
    if (slugPath.length === 0) {
        const readmePath = path.join(DOCS_ROOT, 'README.md');
        if (fs.existsSync(readmePath)) {
            const fileContent = fs.readFileSync(readmePath, 'utf-8');
            const { data, content } = matter(fileContent);

            return {
                meta: {
                    title: data.title || 'Documentation',
                    slug: '',
                    order: data.order,
                    description: data.description,
                },
                content,
                isFolder: false,
            };
        }

        // Fallback: docs/index.md
        const indexPath = path.join(DOCS_ROOT, 'index.md');
        if (fs.existsSync(indexPath)) {
            const fileContent = fs.readFileSync(indexPath, 'utf-8');
            const { data, content } = matter(fileContent);

            return {
                meta: {
                    title: data.title || 'Documentation',
                    slug: 'index',
                    order: data.order,
                    description: data.description,
                },
                content,
                isFolder: false,
            };
        }

        // Final fallback: auto-open the first markdown file in the docs tree
        const tree = scanDirectory(DOCS_ROOT);
        const findFirstLeaf = (nodes: DocNode[]): DocNode | null => {
            for (const node of nodes) {
                if (!node.isFolder) return node;
                if (node.children && node.children.length > 0) {
                    const leaf = findFirstLeaf(node.children);
                    if (leaf) return leaf;
                }
            }
            return null;
        };

        const firstLeaf = findFirstLeaf(tree);
        if (firstLeaf) {
            const withoutPrefix = firstLeaf.path.replace(/^\/docs\/?/, '');
            const autoSlugPath = withoutPrefix.split('/').filter(Boolean);
            if (autoSlugPath.length > 0) {
                return getDocBySlug(autoSlugPath);
            }
        }
    }

    const relativePath = slugPath.join('/');

    // Try direct file first: docs/getting-started/installation.md
    let filePath = path.join(DOCS_ROOT, `${relativePath}.md`);

    // If not found, check if it's a directory
    const dirPath = path.join(DOCS_ROOT, relativePath);
    const isDirectory = fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();

    // If it's a directory, try index.md inside it
    if (!fs.existsSync(filePath) && isDirectory) {
        filePath = path.join(dirPath, 'index.md');
    }

    if (!fs.existsSync(filePath)) {
        // If it's a directory but no index.md, return directory listing
        if (isDirectory) {
            const children = scanDirectory(dirPath, `/docs/${relativePath}`);
            return {
                meta: {
                    title: filenameToTitle(slugPath[slugPath.length - 1] || 'Docs'),
                    slug: slugPath[slugPath.length - 1] || '',
                },
                content: '',
                isFolder: true,
                children
            };
        }
        return null;
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const { data, content } = matter(fileContent);

    const slug = slugPath[slugPath.length - 1] || 'index';

    return {
        meta: {
            title: data.title || filenameToTitle(slug),
            slug,
            order: data.order,
            description: data.description,
        },
        content,
        isFolder: false
    };
}

/**
 * Get all valid document paths for static generation
 * Returns array of slug arrays, e.g., [['getting-started'], ['getting-started', 'installation']]
 */
export function getAllDocPaths(): string[][] {
    const paths: string[][] = [];

    function collectPaths(nodes: DocNode[], parentPath: string[] = []) {
        for (const node of nodes) {
            const currentPath = [...parentPath, node.slug];
            paths.push(currentPath);

            if (node.children) {
                collectPaths(node.children, currentPath);
            }
        }
    }

    collectPaths(getDocTree());
    return paths;
}

/**
 * Flatten the doc tree into a simple list (useful for listing pages)
 */
export function getFlatDocList(): DocNode[] {
    const result: DocNode[] = [];

    function flatten(nodes: DocNode[]) {
        for (const node of nodes) {
            result.push(node);
            if (node.children) {
                flatten(node.children);
            }
        }
    }

    flatten(getDocTree());
    return result;
}
