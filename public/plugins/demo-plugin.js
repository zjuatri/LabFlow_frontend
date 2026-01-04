(function () {
    // Mock the React and Lucide dependencies being available globally
    const React = window.React;
    const Lucide = window.Lucide;
    const registry = window.LabFlow?.pluginRegistry;

    if (!React || !registry) {
        console.error('Core dependencies (React, LabFlow) not found on window');
        return;
    }

    const { Zap } = Lucide;

    function RemotePluginComponent(props) {
        return React.createElement('div', { className: 'p-4' },
            React.createElement('h2', { className: 'text-xl font-bold mb-4' }, 'Hello from Remote!'),
            React.createElement('p', {}, 'This plugin was loaded from a URL at runtime.'),
            React.createElement('button', {
                onClick: props.onClose,
                className: 'mt-4 px-4 py-2 bg-blue-500 text-white rounded'
            }, 'Close Me')
        );
    }

    const pluginDef = {
        id: 'remote-demo-plugin',
        name: 'Remote Plugin',
        icon: Zap || (() => React.createElement('span', {}, '?')),
        component: RemotePluginComponent,
        description: 'A demo plugin loaded from external URL'
    };

    registry.register(pluginDef);
    console.log('Remote plugin registered!', pluginDef);
})();
