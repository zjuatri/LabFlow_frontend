# LabFlow 插件开发指南

LabFlow 支持一个简单但强大的插件系统，允许开发者扩展编辑器的功能。插件以侧边栏的形式呈现（类似于 AI 助手），并可以与文档内容进行交互。

## 1. 插件结构

一个插件由三个核心部分组成：
1.  **组件 (Component)**: 渲染插件 UI 的 React 组件。
2.  **定义 (Definition)**: 符合 `EditorPlugin` 接口的对象，描述插件的属性。
3.  **注册 (Registration)**: 调用 `pluginRegistry.register()` 来启用插件。

## 2. 创建插件

### 第一步：定义组件

您的组件将接收 `EditorPluginProps` 属性：

```typescript
import { EditorPluginProps } from '../types';

export function MyPlugin({ projectId, existingBlocks, onInsertBlocks, onClose }: EditorPluginProps) {
    return (
        <div className="p-4 bg-white h-full">
            <h1>我的插件</h1>
            <button onClick={onClose}>关闭</button>
        </div>
    );
}
```

### 第二步：定义插件元数据

```typescript
import { EditorPlugin } from '../types';
import { Sparkles } from 'lucide-react';

export const myPluginDefinition: EditorPlugin = {
    id: 'my-plugin',        // 唯一 ID
    name: '我的插件',        // 显示名称
    icon: Sparkles,         // Lucide 图标组件
    component: MyPlugin,    // 您的组件
    description: '插件功能的描述',
};
```

### 第三步：注册插件

在文件末尾（或专门的注册文件中）调用注册方法：

```typescript
import { pluginRegistry } from '../registry';

pluginRegistry.register(myPluginDefinition);
```

### 第四步：在主应用中导入

为了确保插件代码被加载，您必须在 `app/projects/[id]/page.tsx` 中导入它：

```typescript
// app/projects/[id]/page.tsx
import '@/components/editor/plugins/samples/MyPlugin';
```

## 3. 与编辑器交互

### 读取内容
使用 `existingBlocks` 属性来读取文档的当前状态。

### 写入内容
使用 `onInsertBlocks(blocks)` 向文档追加新内容。

```typescript
const handleAdd = () => {
    onInsertBlocks([{
        id: Date.now().toString(),
        type: 'paragraph',
        content: '来自插件的问候！'
    }]);
};
```

## 4. 状态管理

如果可能，请避免为插件特定的状态使用全局 Store。
- 使用本地 React 状态 (`useState`) 处理瞬时数据。
- 使用 `localStorage` (使用项目 ID 作为前缀键) 处理简单的持久化。
- 对于复杂数据，我们未来可能会在项目架构中添加 `pluginData` 字段。

## 5. 示例

请参考 `components/editor/plugins/samples/TodoPlugin.tsx` 获取完整的参考实现。
