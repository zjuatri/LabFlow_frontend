import { useEffect, useState } from 'react';
import { getToken } from '@/lib/auth';

interface ProjectPreviewProps {
    code: string;
    className?: string;
}

export default function ProjectPreview({ code, className = '' }: ProjectPreviewProps) {
    const [svgContent, setSvgContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);

    useEffect(() => {
        let mounted = true;
        const fetchPreview = async () => {
            if (!code.trim()) return;

            setLoading(true);
            try {
                const token = getToken();
                // Use the backend URL from environment or default relative path
                const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

                const response = await fetch(`${baseUrl}/api/render-typst`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({ code }),
                });

                if (!response.ok) throw new Error('Render failed');

                const data = await response.json();
                if (mounted && data.pages && data.pages.length > 0) {
                    setSvgContent(data.pages[0]);
                } else {
                    if (mounted) setError(true);
                }
            } catch {
                if (mounted) setError(true);
            } finally {
                if (mounted) setLoading(false);
            }
        };

        fetchPreview();

        return () => {
            mounted = false;
        };
    }, [code]);

    if (loading) {
        return (
            <div className={`flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 animate-pulse ${className}`}>
                <div className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-500 rounded-full animate-spin" />
            </div>
        );
    }

    if (error || !svgContent) {
        return (
            <div className={`flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-zinc-400 ${className}`}>
                <span className="text-xs">无预览</span>
            </div>
        );
    }

    return (
        <div
            className={`overflow-hidden bg-white shadow-sm transition-shadow ${className}`}
            style={{
                // Force SVG to scale
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <div
                className="w-full h-full [&>svg]:w-full [&>svg]:h-full [&>svg]:object-contain"
                dangerouslySetInnerHTML={{ __html: svgContent }}
            />
        </div>
    );
}
