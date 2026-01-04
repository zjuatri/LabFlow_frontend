import { getDocTree } from '@/lib/docs';
import { NextResponse } from 'next/server';

export async function GET() {
    const tree = getDocTree();
    return NextResponse.json(tree);
}
