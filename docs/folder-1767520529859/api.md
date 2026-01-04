---
title: API参考
date: '2026-01-04T12:06:05.096Z'
---
本文档详细介绍了 LabFlow 插件开发相关的接口和类型。

## 全局对象 (Global Objects)

插件环境中可用的全局变量：

```typescript
interface Window {
    React: typeof React;
    Lucide: typeof Lucide;
    LabFlow: {
        pluginRegistry: PluginRegistry;
    };
}
```

## PluginRegistry

用于注册和管理插件的单例对象。通过 `window.LabFlow.pluginRegistry` 访问。

### 方法

#### `register(plugin: EditorPlugin): void`
注册一个新的插件。如果 ID 已存在，将覆盖旧插件。

#### `get(id: string): EditorPlugin | undefined`
获取指定 ID 的插件。

#### `getAll(): EditorPlugin[]`
获取所有已注册的插件列表。

---

## 接口定义

### EditorPlugin

插件的主定义接口。

```typescript
interface EditorPlugin {
    /** 插件的唯一标识符 (例如 "my-plugin") */
    id: string;

    /** 在 UI 中显示的名称 */
    name: string;

    /** 图标组件 (通常来自 Lucide) */
    icon: React.ComponentType<{ size?: number; className?: string }>;

    /** 
     * 侧边栏中渲染的主组件。
     * 接收 `EditorPluginProps` 作为 props。
     */
    component: React.ComponentType<EditorPluginProps>;

    /** 可选描述 */
    description?: string;
}
```

### EditorPluginProps

传递给插件组件 (`component`) 的 Props。

```typescript
interface EditorPluginProps {
    /** 当前项目的 ID */
    projectId: string;

    /** 
     * 当前文档的所有块 (只读引用)。
     * 用于分析文档内容。
     */
    existingBlocks: TypstBlock[];

    /** 
     * 插入新块的回调函数。
     * @param blocks 要插入的 TypstBlock 数组
     */
    onInsertBlocks: (blocks: TypstBlock[]) => void;

    /** 关闭插件侧边栏的回调 */
    onClose: () => void;
}
```

---

## 数据类型 (TypstBlock)

文档内容的基本单元。`TypstBlock` 是一个联合类型，根据 `type` 字段的不同，可能包含不同的属性。

### 基础结构

所有块都包含以下基础字段：

```typescript
interface TypstBlock {
    /** 块的唯一 ID (UUID v4) */
    id: string;

    /** 块类型 */
    type: BlockType;

    /** 
     * 核心内容。
     * - 对于 `paragraph`, `heading`, `code` 等：存储纯文本内容。
     * - 对于 `table`, `chart`：存储 JSON 序列化后的配置对象。
     */
    content: string;

    /** 编辑器占位符提示 (可选) */
    placeholder?: string;

    /** UI 折叠状态 (可选) */
    uiCollapsed?: boolean;
}
```

### 块类型 (BlockType)

支持以下类型：
- `'heading'`: 标题
- `'paragraph'`: 段落
- `'code'`: 代码块
- `'math'`: 数学公式
- `'image'`: 图片
- `'list'`: 列表 (无序/有序)
- `'table'`: 表格
- `'chart'`: 图表
- `'vertical_space'`: 垂直间距
- `'input_field'`: 输入字段 (用于封面或表单)
- `'cover'`: 封面容器
- `'composite_row'`: 复合行 (用于并排布局)

### 通用样式属性

适用于多种块类型的样式属性：

```typescript
interface TypstBlock {
    // ...
    
    /** 对齐方式 */
    align?: 'left' | 'center' | 'right';

    /** 字体名称 (例如 "SimSun", "SimHei") */
    font?: string;

    /** 字体大小 (例如 "12pt", "14px") */
    fontSize?: string;
    
    /** 行间距倍数 (例如 1.5) - 主要用于段落 */
    lineSpacing?: number;
}
```

### 类型特定属性

#### 标题 (Heading)
```typescript
interface TypstBlock {
    /** 标题级别 (1-6) */
    level?: number;
}
```

#### 代码块 (Code)
```typescript
interface TypstBlock {
    /** 编程语言 (例如 "python", "cpp") */
    language?: string;
}
```

#### 图片 (Image)
```typescript
interface TypstBlock {
    /** 图片宽度 (例如 "100%", "8cm") */
    width?: string;

    /** 图片高度 (例如 "auto", "5cm") */
    height?: string;

    /** 图片说明文字 */
    caption?: string;

    /** 说明文字字体 */
    captionFont?: string;
}
```

#### 数学公式 (Math)
支持 LaTeX 和 Typst 双向转换。

```typescript
interface TypstBlock {
    /** 当前编辑器使用的格式 */
    mathFormat?: 'latex' | 'typst';

    /** LaTeX 源码 */
    mathLatex?: string;

    /** Typst 源码 */
    mathTypst?: string;

    /** 多行公式支持 */
    mathLines?: Array<{ latex: string; typst: string }>;

    /** 是否显示左侧大括号 (类似 cases 环境) */
    mathBrace?: boolean;
}
```

#### 输入字段 (Input Field)
通常用于封面页的键值对输入。

```typescript
interface TypstBlock {
    // 单行模式 (兼容旧版)
    inputLabel?: string;       // 左侧标签 (例如 "姓名")
    inputValue?: string;       // 右侧值
    inputSeparator?: string;   // 分隔符 (默认 "：")
    inputShowUnderline?: boolean; // 是否显示下划线
    inputWidth?: string;       // 总宽度百分比
    inputAlign?: 'left' | 'center' | 'right';
    inputFontSize?: string;
    inputFontFamily?: string;

    // 多行模式
    inputLines?: Array<{ label: string; value: string }>;
}
```

#### 复合行 (Composite Row)
用于实现并排布局（类似 Flexbox）。

```typescript
interface TypstBlock {
    /** 子元素对齐方式 */
    compositeJustify?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly';

    /** 子元素间距 (例如 "8pt") */
    compositeGap?: string;

    /** 垂直对齐方式 */
    compositeVerticalAlign?: 'top' | 'middle' | 'bottom';
    
    /** 子块列表 */
    children?: TypstBlock[];
}
```

#### 封面容器 (Cover)
```typescript
interface TypstBlock {
    /** 是否固定为单页 */
    coverFixedOnePage?: boolean;

    /** 封面内的子块 */
    children?: TypstBlock[];
}
```

### 复杂内容结构

对于 `table` 和 `chart` 类型，其配置存储在 `content` 字段中（JSON 字符串）。

#### 表格 (Table) Payload
```typescript
type TableStyle = 'normal' | 'three-line';

interface PersistedTablePayload {
    caption?: string;
    style?: TableStyle;
    rows: number;
    cols: number;
    cells: Array<Array<{
        content: string; // 单元格内的 Typst 标记
        rowspan?: number;
        colspan?: number;
        hidden?: boolean; // 被合并单元格覆盖
    }>>;
}
```

#### 图表 (Chart) Payload
```typescript
type ChartType = 'scatter' | 'bar' | 'pie' | 'hbar';
type ChartDataSource = 'manual' | 'table';

interface PersistedChartPayload {
    chartType: ChartType;
    title: string;
    xLabel: string;
    yLabel: string;
    legend: boolean;
    dataSource: ChartDataSource;
    
    /** 手动输入的数据 (CSV/TSV 格式) */
    manualText: string;
    
    /** 渲染后的图片 URL */
    imageUrl?: string;
}
```
