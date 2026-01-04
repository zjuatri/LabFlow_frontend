/**
 * Example LabFlow Plugin - Hello World
 * 
 * This is a minimal example showing how to create a LabFlow plugin.
 * Plugins must be in UMD/IIFE format and register themselves via:
 *   window.LabFlow.pluginRegistry.register(...)
 */
(function () {
    'use strict';

    // Access globals provided by LabFlow
    const React = window.React;
    const Lucide = window.Lucide;
    const pluginRegistry = window.LabFlow?.pluginRegistry;

    if (!React || !pluginRegistry) {
        console.error('[HelloPlugin] Required globals not found. Make sure this runs in LabFlow context.');
        return;
    }

    // The plugin component (React functional component)
    function HelloWorldPlugin(props) {
        const { onClose, onInsertBlocks, existingBlocks } = props;
        const [message, setMessage] = React.useState('');

        const handleInsert = () => {
            // Create a simple paragraph block
            const newBlock = {
                id: 'block-' + Date.now(),
                type: 'paragraph',
                content: message || 'Hello from the plugin!',
            };
            onInsertBlocks([newBlock]);
        };

        return React.createElement('div', {
            className: 'flex flex-col h-full bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800'
        }, [
            // Header
            React.createElement('div', {
                key: 'header',
                className: 'flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800'
            }, [
                React.createElement('div', {
                    key: 'title',
                    className: 'flex items-center gap-2 text-zinc-900 dark:text-zinc-100 font-medium'
                }, [
                    React.createElement(Lucide.Smile, { key: 'icon', size: 16, className: 'text-yellow-500' }),
                    'Hello Plugin'
                ]),
                React.createElement('button', {
                    key: 'close',
                    onClick: onClose,
                    className: 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200'
                }, React.createElement(Lucide.X, { size: 18 }))
            ]),

            // Content
            React.createElement('div', {
                key: 'content',
                className: 'flex-1 p-4 space-y-4'
            }, [
                React.createElement('p', {
                    key: 'desc',
                    className: 'text-sm text-zinc-600 dark:text-zinc-400'
                }, '这是一个示例插件，展示如何创建 LabFlow 插件。'),

                React.createElement('div', { key: 'input-group' }, [
                    React.createElement('label', {
                        key: 'label',
                        className: 'block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1'
                    }, '输入消息'),
                    React.createElement('input', {
                        key: 'input',
                        type: 'text',
                        value: message,
                        onChange: function (e) { setMessage(e.target.value); },
                        placeholder: '输入要插入的文本...',
                        className: 'w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 focus:ring-2 focus:ring-blue-500 outline-none'
                    })
                ]),

                React.createElement('button', {
                    key: 'insert-btn',
                    onClick: handleInsert,
                    className: 'w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded flex items-center justify-center gap-2'
                }, [
                    React.createElement(Lucide.ArrowRight, { key: 'arrow', size: 16 }),
                    '插入到文档'
                ]),

                // Show existing blocks count
                React.createElement('p', {
                    key: 'stats',
                    className: 'text-xs text-zinc-400'
                }, `当前文档有 ${existingBlocks?.length || 0} 个内容块`)
            ])
        ]);
    }

    // Register the plugin
    pluginRegistry.register({
        id: 'hello-world',
        name: 'Hello World',
        icon: Lucide.Smile,
        component: HelloWorldPlugin,
        description: '一个简单的示例插件，演示插件开发基础',
    });

    console.log('[HelloPlugin] Registered successfully!');
})();
