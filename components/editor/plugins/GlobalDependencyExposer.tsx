'use client';

import React from 'react';
import * as Lucide from 'lucide-react';
import { pluginRegistry } from '@/components/editor/plugins/registry';

declare global {
    interface Window {
        React: typeof React;
        Lucide: typeof Lucide;
        LabFlow: {
            pluginRegistry: typeof pluginRegistry;
        };
    }
}

/**
 * reliable way to expose dependencies for dynamic plugins
 */
export function GlobalDependencyExposer() {
    if (typeof window !== 'undefined') {
        window.React = React;
        window.Lucide = Lucide;
        window.LabFlow = {
            pluginRegistry,
        };
    }
    return null;
}
