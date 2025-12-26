'use client';

import { TypstBlock } from '@/lib/typst';
import { useState } from 'react';
import Image from 'next/image';
import ScatterEditor from './ChartBlockEditors/ScatterEditor';
import BarEditor from './ChartBlockEditors/BarEditor';
import HBarEditor from './ChartBlockEditors/HBarEditor';
import PieEditor from './ChartBlockEditors/PieEditor';
import { ChartType, ChartData } from './ChartBlockEditors/shared';
import { safeParseChartContent } from './ChartBlockEditors/chartDataParser';
import { convertChartToRenderRequest } from './ChartBlockEditors/chartDataConverter';

export type ChartRenderRequest = {
  chart_type: ChartType;
  title: string;
  x_label: string;
  y_label: string;
  legend: boolean;
  data: Array<Record<string, unknown>>;
};

interface ChartBlockEditorProps {
  block: TypstBlock;
  allBlocks: TypstBlock[];
  availableTables: Array<{ id: string; label: string }>;
  onUpdate: (update: Partial<TypstBlock>) => void;
  lastTableSelection: { blockId: string; r1: number; c1: number; r2: number; c2: number } | null;
  onRenderChart: (payload: ChartRenderRequest) => Promise<string>;
}

export { safeParseChartContent };

export default function ChartBlockEditor({
  block,
  allBlocks,
  availableTables,
  onUpdate,
  lastTableSelection,
  onRenderChart,
}: ChartBlockEditorProps) {
  const [chartSelectionMode, setChartSelectionMode] = useState(false);
  const [chartPickAnchor, setChartPickAnchor] = useState<{ key: string; r: number; c: number } | null>(null);

  const chart = safeParseChartContent(block.content);

  const updateChart = (partial: Partial<ChartData>) => {
    const next = { ...chart, ...partial };
    onUpdate({ content: JSON.stringify(next) });
  };

  const handleRenderChartClick = async () => {
    try {
      const payload = convertChartToRenderRequest(chart, allBlocks);
      const imageUrl = await onRenderChart(payload);
      updateChart({ imageUrl });
    } catch (error) {
      console.error('生成图表失败:', error);
      throw error;
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* 图表类型选择器 */}
      <div className="flex flex-wrap gap-2 items-center">
        <label className="text-xs text-zinc-600 dark:text-zinc-400">类型</label>
        <select
          value={chart.chartType}
          onChange={(e) => updateChart({ chartType: e.target.value as ChartType })}
          className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
        >
          <option value="scatter">散点图</option>
          <option value="bar">柱形图</option>
          <option value="pie">饼图</option>
          <option value="hbar">条形图</option>
        </select>

        <label className="text-xs text-zinc-600 dark:text-zinc-400 ml-2">图例</label>
        <input
          type="checkbox"
          checked={!!chart.legend}
          onChange={(e) => updateChart({ legend: e.target.checked })}
        />
      </div>

      {/* 标题输入 */}
      <input
        type="text"
        value={chart.title}
        onChange={(e) => updateChart({ title: e.target.value })}
        className="w-full p-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
        placeholder="图表标题"
      />

      {/* X/Y 轴标签 */}
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          value={chart.xLabel}
          onChange={(e) => updateChart({ xLabel: e.target.value })}
          className="w-full p-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
          placeholder="X 轴标签"
        />
        <input
          type="text"
          value={chart.yLabel}
          onChange={(e) => updateChart({ yLabel: e.target.value })}
          className="w-full p-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
          placeholder="Y 轴标签"
        />
      </div>

      {/* 饼图数据来源选择 */}
      {chart.chartType === 'pie' && (
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs text-zinc-600 dark:text-zinc-400">数据来源</label>
          <label className="text-xs flex items-center gap-1">
            <input
              type="radio"
              name={`chart-source-${block.id}`}
              checked={(chart.dataSource ?? 'manual') === 'manual'}
              onChange={() => updateChart({ dataSource: 'manual' })}
            />
            手动输入
          </label>
          <label className="text-xs flex items-center gap-1">
            <input
              type="radio"
              name={`chart-source-${block.id}`}
              checked={(chart.dataSource ?? 'manual') === 'table'}
              onChange={() => updateChart({ dataSource: 'table' })}
            />
            从表格导入
          </label>
        </div>
      )}

      {/* 根据图表类型渲染对应的编辑器 */}
      {chart.chartType === 'scatter' && (
        <ScatterEditor
          chart={chart}
          block={block}
          allBlocks={allBlocks}
          availableTables={availableTables}
          updateChart={updateChart}
          lastTableSelection={lastTableSelection}
          chartSelectionMode={chartSelectionMode}
          setChartSelectionMode={setChartSelectionMode}
          chartPickAnchor={chartPickAnchor}
          setChartPickAnchor={setChartPickAnchor}
        />
      )}

      {chart.chartType === 'bar' && (
        <BarEditor
          chart={chart}
          block={block}
          allBlocks={allBlocks}
          availableTables={availableTables}
          updateChart={updateChart}
          lastTableSelection={lastTableSelection}
          chartSelectionMode={chartSelectionMode}
          setChartSelectionMode={setChartSelectionMode}
          chartPickAnchor={chartPickAnchor}
          setChartPickAnchor={setChartPickAnchor}
        />
      )}

      {chart.chartType === 'hbar' && (
        <HBarEditor
          chart={chart}
          block={block}
          allBlocks={allBlocks}
          availableTables={availableTables}
          updateChart={updateChart}
          lastTableSelection={lastTableSelection}
          chartSelectionMode={chartSelectionMode}
          setChartSelectionMode={setChartSelectionMode}
          chartPickAnchor={chartPickAnchor}
          setChartPickAnchor={setChartPickAnchor}
        />
      )}

      {chart.chartType === 'pie' && (
        <PieEditor
          chart={chart}
          block={block}
          allBlocks={allBlocks}
          availableTables={availableTables}
          updateChart={updateChart}
          lastTableSelection={lastTableSelection}
          chartSelectionMode={chartSelectionMode}
          setChartSelectionMode={setChartSelectionMode}
          chartPickAnchor={chartPickAnchor}
          setChartPickAnchor={setChartPickAnchor}
        />
      )}

      {/* 预览图片 */}
      {(chart.imageUrl ?? '').trim() ? (
        <div className={`flex ${
          (block.align || 'center') === 'left' ? 'justify-start' :
          (block.align || 'center') === 'right' ? 'justify-end' : 'justify-center'
        }`}>
          <Image
            src={chart.imageUrl}
            alt="图表预览"
            width={800}
            height={600}
            className="max-h-72 max-w-full h-auto w-auto object-contain rounded border border-zinc-200 dark:border-zinc-700"
            unoptimized
          />
        </div>
      ) : (
        <div className="text-xs text-zinc-500 dark:text-zinc-400">尚未生成预览</div>
      )}

      {/* 对齐方式 */}
      {(chart.imageUrl ?? '').trim() && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-600 dark:text-zinc-400">对齐：</label>
          <div className="flex gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onUpdate({ align: 'left' }); }}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                (block.align || 'center') === 'left'
                  ? 'bg-blue-500 text-white'
                  : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600'
              }`}
            >
              居左
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onUpdate({ align: 'center' }); }}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                (block.align || 'center') === 'center'
                  ? 'bg-blue-500 text-white'
                  : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600'
              }`}
            >
              居中
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onUpdate({ align: 'right' }); }}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                (block.align || 'center') === 'right'
                  ? 'bg-blue-500 text-white'
                  : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600'
              }`}
            >
              居右
            </button>
          </div>
        </div>
      )}

      {/* 宽度滑块 */}
      <div>
        <label className="text-xs text-zinc-600 dark:text-zinc-400 block mb-2">
          宽度: {(() => {
            const w = block.width || '50%';
            return parseFloat(w) || 50;
          })()}%
        </label>
        <input
          type="range"
          min="0"
          max="100"
          value={(() => {
            const w = block.width || '50%';
            return parseFloat(w) || 50;
          })()}
          onChange={(e) => {
            const val = e.target.value;
            onUpdate({ width: `${val}%` });
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
      </div>

      {/* 生成按钮 */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleRenderChartClick}
          className="px-3 py-2 text-sm rounded bg-blue-500 hover:bg-blue-600 text-white"
        >
          生成/更新预览
        </button>
      </div>
    </div>
  );
}