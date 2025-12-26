/*
	HBarEditor (条形图) 独立文件：与 BarEditor UI/数据结构一致。
	之所以不再 re-export，是为了满足“柱状图/条形图逻辑分成两个文件”的需求。
*/

'use client';

import { TypstBlock } from '@/lib/typst';
import { type MouseEvent as ReactMouseEvent, type ClipboardEvent as ReactClipboardEvent } from 'react';
import { MousePointer2 } from 'lucide-react';
import {
	ChartData,
	BarSeries,
	TableAxisMode,
	TableSelection,
	parseRow,
	toRow,
	isInRect,
	getTablePayloadById,
	getCellPlain,
} from './shared';

interface HBarEditorProps {
	chart: ChartData;
	block: TypstBlock;
	allBlocks: TypstBlock[];
	availableTables: Array<{ id: string; label: string }>;
	updateChart: (partial: Partial<ChartData>) => void;
	lastTableSelection: { blockId: string; r1: number; c1: number; r2: number; c2: number } | null;
	chartSelectionMode: boolean;
	setChartSelectionMode: (mode: boolean | ((prev: boolean) => boolean)) => void;
	chartPickAnchor: { key: string; r: number; c: number } | null;
	setChartPickAnchor: (anchor: { key: string; r: number; c: number } | null) => void;
}

export default function HBarEditor({
	chart,
	block,
	allBlocks,
	availableTables,
	updateChart,
	lastTableSelection,
	chartSelectionMode,
	setChartSelectionMode,
	chartPickAnchor,
	setChartPickAnchor,
}: HBarEditorProps) {
	const series = (chart.barSeries ?? []) as BarSeries[];
	const defaultSeries: BarSeries = { name: '系列1', source: 'manual', axisMode: 'cols', yRow: '', tableSelection: undefined };
	const safeSeries: BarSeries[] = series && series.length > 0 ? series : [defaultSeries];

	const upsert = (idx: number, patch: Partial<BarSeries>) => {
		const next = safeSeries.slice();
		const cur = next[idx]
			?? safeSeries[idx]
			?? { name: `系列${idx + 1}`, source: 'manual', axisMode: 'cols', yRow: '', tableSelection: undefined };
		next[idx] = { ...cur, ...patch } as BarSeries;
		updateChart({ barSeries: next });
	};

	const removeSeries = (idx: number) => {
		const next = safeSeries.slice();
		next.splice(idx, 1);
		const result: BarSeries[] = next.length > 0 ? next : [defaultSeries];
		updateChart({ barSeries: result });
	};

	const addSeries = () => {
		const next = safeSeries.slice();
		const n = next.length + 1;
		next.push({ name: `系列${n}`, source: 'manual', axisMode: 'cols', yRow: '', tableSelection: undefined });
		updateChart({ barSeries: next });
	};

	const applyLastTableSelectionToBarSeries = (seriesIndex: number) => {
		const snap = lastTableSelection;
		if (!snap) return;
		const base: BarSeries = safeSeries[seriesIndex]
			?? { name: `系列${seriesIndex + 1}`, source: 'table', axisMode: 'cols', yRow: '', tableSelection: undefined };

		const top = Math.min(snap.r1, snap.r2);
		const bottom = Math.max(snap.r1, snap.r2);
		const left = Math.min(snap.c1, snap.c2);
		const right = Math.max(snap.c1, snap.c2);
		const normalized = base.axisMode === 'rows'
			? { blockId: snap.blockId, r1: top, r2: top + 1, c1: left, c2: right }
			: { blockId: snap.blockId, r1: top, r2: bottom, c1: left, c2: left + 1 };

		const next = safeSeries.slice();
		next[seriesIndex] = { ...base, source: 'table', tableSelection: normalized };
		updateChart({ barSeries: next });
	};

	const anyManual = safeSeries.some((s) => (s.source ?? 'manual') === 'manual');

	const xSource: 'manual' | 'table' = (chart.barXSource ?? 'manual') === 'table' ? 'table' : 'manual';
	const xSel = chart.barXTableSelection;

	const normalizeToVector = (snap: { blockId: string; r1: number; c1: number; r2: number; c2: number }): TableSelection => {
		const top = Math.min(snap.r1, snap.r2);
		const bottom = Math.max(snap.r1, snap.r2);
		const left = Math.min(snap.c1, snap.c2);
		const right = Math.max(snap.c1, snap.c2);
		const height = bottom - top;
		const width = right - left;
		const asRow = height === 0 || width >= height;
		return asRow
			? { blockId: snap.blockId, r1: top, r2: top, c1: left, c2: right }
			: { blockId: snap.blockId, r1: top, r2: bottom, c1: left, c2: left };
	};

	const applyLastTableSelectionToBarX = () => {
		const snap = lastTableSelection;
		if (!snap) return;
		updateChart({ barXSource: 'table', barXTableSelection: normalizeToVector(snap) });
	};

	const renderXRow = () => {
		const xCells0 = parseRow(chart.barXRow);
		const cols = Math.max(10, xCells0.length + 2);
		const xCells = Array.from({ length: cols }, (_, i) => xCells0[i] ?? '');

		const setCell = (c: number, val: string) => {
			const next = xCells.slice();
			next[c] = val;
			updateChart({ barXRow: toRow(next) });
		};

		const handlePaste = (e: ReactClipboardEvent<HTMLInputElement>, c0: number) => {
			const text = e.clipboardData.getData('text/plain');
			if (!text || !/\t|\n|\r/.test(text)) return;
			e.preventDefault();
			const pasteRows = text.replace(/\r/g, '').split('\n').map((l) => l.split('\t'));
			const next = xCells.slice();
			for (let dc = 0; dc < (pasteRows[0]?.length ?? 0); dc++) {
				const cc = c0 + dc;
				if (cc >= cols) continue;
				next[cc] = pasteRows[0][dc] ?? '';
			}
			updateChart({ barXRow: toRow(next) });
		};

		return (
			<div className="overflow-auto border border-zinc-200 dark:border-zinc-700 rounded">
				<table className="w-full text-xs border-collapse">
					<tbody>
						<tr>
							<td className="border border-zinc-200 dark:border-zinc-700 px-2 py-1 bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 w-10">X</td>
							{xCells.map((cell, c) => (
								<td key={c} className="border border-zinc-200 dark:border-zinc-700 p-0">
									<input
										type="text"
										value={cell}
										onChange={(e) => setCell(c, e.target.value)}
										onPaste={(e) => handlePaste(e, c)}
										className="w-full px-2 py-1 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 outline-none"
									/>
								</td>
							))}
						</tr>
					</tbody>
				</table>
			</div>
		);
	};

	const renderYRow = (s: BarSeries, idx: number) => {
		const yCells0 = parseRow(s.yRow);
		const cols = Math.max(10, yCells0.length + 2);
		const yCells = Array.from({ length: cols }, (_, i) => yCells0[i] ?? '');

		const setCell = (c: number, val: string) => {
			const next = yCells.slice();
			next[c] = val;
			upsert(idx, { yRow: toRow(next) });
		};

		const handlePaste = (e: ReactClipboardEvent<HTMLInputElement>, c0: number) => {
			const text = e.clipboardData.getData('text/plain');
			if (!text || !/\t|\n|\r/.test(text)) return;
			e.preventDefault();
			const pasteRows = text.replace(/\r/g, '').split('\n').map((l) => l.split('\t'));
			const next = yCells.slice();
			for (let dc = 0; dc < (pasteRows[0]?.length ?? 0); dc++) {
				const cc = c0 + dc;
				if (cc >= cols) continue;
				next[cc] = pasteRows[0][dc] ?? '';
			}
			upsert(idx, { yRow: toRow(next) });
		};

		return (
			<div className="overflow-auto border border-zinc-200 dark:border-zinc-700 rounded">
				<table className="w-full text-xs border-collapse">
					<tbody>
						<tr>
							<td className="border border-zinc-200 dark:border-zinc-700 px-2 py-1 bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 w-10">Y</td>
							{yCells.map((cell, c) => (
								<td key={c} className="border border-zinc-200 dark:border-zinc-700 p-0">
									<input
										type="text"
										value={cell}
										onChange={(e) => setCell(c, e.target.value)}
										onPaste={(e) => handlePaste(e, c)}
										className="w-full px-2 py-1 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 outline-none"
									/>
								</td>
							))}
						</tr>
					</tbody>
				</table>
			</div>
		);
	};

	const renderXTableSelector = () => {
		const blockId = xSel?.blockId ?? '';
		const tablePayload = blockId ? getTablePayloadById(blockId, allBlocks) : null;
		const rows = tablePayload?.rows ?? 0;
		const cols = tablePayload?.cols ?? 0;
		const sel = xSel;
		const pickKey = `hbar-x-${block.id}`;

		const constrainToVector = (anchor: { r: number; c: number }, r: number, c: number) => {
			const dr = Math.abs(r - anchor.r);
			const dc = Math.abs(c - anchor.c);
			if (dc >= dr) {
				const left = Math.min(anchor.c, c);
				const right = Math.max(anchor.c, c);
				const rr = Math.max(0, Math.min(rows - 1, anchor.r));
				return { r1: rr, r2: rr, c1: Math.max(0, Math.min(cols - 1, left)), c2: Math.max(0, Math.min(cols - 1, right)) };
			}
			const top = Math.min(anchor.r, r);
			const bottom = Math.max(anchor.r, r);
			const cc = Math.max(0, Math.min(cols - 1, anchor.c));
			return { r1: Math.max(0, Math.min(rows - 1, top)), r2: Math.max(0, Math.min(rows - 1, bottom)), c1: cc, c2: cc };
		};

		const pickCell = (e: ReactMouseEvent, r: number, c: number) => {
			e.preventDefault();
			if (!blockId) return;

			const anchor = chartPickAnchor && chartPickAnchor.key === pickKey ? chartPickAnchor : null;
			const curSel = sel;

			if (chartSelectionMode) {
				if (!curSel || (curSel.r1 === curSel.r2 && curSel.c1 === curSel.c2) === false) {
					setChartPickAnchor({ key: pickKey, r, c });
					updateChart({ barXSource: 'table', barXTableSelection: { blockId, r1: r, r2: r, c1: c, c2: c } });
					return;
				}
				setChartPickAnchor(null);
				const a = { r: curSel.r1, c: curSel.c1 };
				const constrained = constrainToVector(a, r, c);
				updateChart({ barXSource: 'table', barXTableSelection: { blockId, ...constrained } });
				return;
			}

			if (e.shiftKey && anchor) {
				const constrained = constrainToVector({ r: anchor.r, c: anchor.c }, r, c);
				updateChart({ barXSource: 'table', barXTableSelection: { blockId, ...constrained } });
				return;
			}

			setChartPickAnchor({ key: pickKey, r, c });
			updateChart({ barXSource: 'table', barXTableSelection: { blockId, r1: r, r2: r, c1: c, c2: c } });
		};

		return (
			<div className="flex flex-col gap-2">
				<div className="flex items-center gap-2 flex-wrap">
					<label className="text-xs text-zinc-600 dark:text-zinc-400">表格</label>
					<select
						value={blockId}
						onChange={(e) => {
							const nextId = e.target.value;
							if (!nextId) {
								updateChart({ barXTableSelection: undefined });
								return;
							}
							updateChart({ barXSource: 'table', barXTableSelection: { blockId: nextId, r1: 0, r2: 0, c1: 0, c2: 9 } });
						}}
						className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
					>
						<option value="">请选择表格</option>
						{availableTables.map((t) => (
							<option key={t.id} value={t.id}>{t.label}</option>
						))}
					</select>

					<button
						type="button"
						onClick={applyLastTableSelectionToBarX}
						disabled={!lastTableSelection}
						className="ml-auto px-2 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-600 disabled:opacity-40"
						title={lastTableSelection ? '使用最近一次在表格块中框选的区域' : '请先在任意表格块中框选一块区域'}
					>
						使用最近选区
					</button>

					<button
						type="button"
						onClick={() => setChartSelectionMode((v) => !v)}
						className={`px-2 py-1 text-xs rounded flex items-center gap-1 border border-zinc-300 dark:border-zinc-600 transition-colors ${
							chartSelectionMode
								? 'bg-blue-500 hover:bg-blue-600 text-white'
								: 'bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-300'
						}`}
						title={chartSelectionMode ? '已开启：点击两次即可框选' : '开启：无需按 Shift 框选区域'}
					>
						<MousePointer2 size={14} />
						选区模式
					</button>
				</div>

				{tablePayload ? (
					<div className="text-[11px] text-zinc-500 dark:text-zinc-400">
						{chartSelectionMode
							? '选区模式：第一次点击设定起点；第二次点击设定终点。'
							: '普通模式：点击设定起点；Shift+点击设定终点。'} 会自动约束为 1 行或 1 列（按拖动方向）。
					</div>
				) : (
					<div className="text-[11px] text-zinc-500 dark:text-zinc-400">先选择一个表格。</div>
				)}

				{tablePayload ? (
					<div className="overflow-auto border border-zinc-200 dark:border-zinc-700 rounded max-h-72">
						<table className="w-full text-xs border-collapse">
							<tbody>
								{Array.from({ length: rows }, (_, r) => (
									<tr key={r}>
										{Array.from({ length: cols }, (_, c) => {
											const active = isInRect(r, c, sel);
											return (
												<td
													key={c}
													onMouseDown={(e) => pickCell(e, r, c)}
													className={`border border-zinc-200 dark:border-zinc-700 px-2 py-1 select-none cursor-pointer ${
														active ? 'bg-blue-100 dark:bg-blue-900/25' : 'bg-white dark:bg-zinc-950'
													}`}
													title={`R${r + 1}C${c + 1}`}
												>
													{getCellPlain(tablePayload, r, c)}
												</td>
											);
										})}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : null}
			</div>
		);
	};

	const renderTableSelector = (s: BarSeries, idx: number) => {
		const blockId = s.tableSelection?.blockId ?? '';
		const tablePayload = blockId ? getTablePayloadById(blockId, allBlocks) : null;
		const rows = tablePayload?.rows ?? 0;
		const cols = tablePayload?.cols ?? 0;
		const sel = s.tableSelection;
		const pickKey = `hbar-${block.id}-${idx}`;

		const constrainTo2Axis = (
			axisMode: TableAxisMode,
			rect: { r1: number; c1: number; r2: number; c2: number },
		) => {
			const top = Math.min(rect.r1, rect.r2);
			const bottom = Math.max(rect.r1, rect.r2);
			const left = Math.min(rect.c1, rect.c2);
			const right = Math.max(rect.c1, rect.c2);
			if (axisMode === 'rows') {
				const r1 = Math.max(0, Math.min(rows - 1, top));
				const r2 = Math.max(0, Math.min(rows - 1, r1 + 1));
				return { r1, r2, c1: left, c2: right };
			}
			const c1 = Math.max(0, Math.min(cols - 1, left));
			const c2 = Math.max(0, Math.min(cols - 1, c1 + 1));
			return { r1: top, r2: bottom, c1, c2 };
		};

		const pickCell = (e: ReactMouseEvent, r: number, c: number) => {
			e.preventDefault();
			if (!blockId) return;

			const anchor = chartPickAnchor && chartPickAnchor.key === pickKey ? chartPickAnchor : null;

			if (chartSelectionMode) {
				if (!sel || sel.r1 !== sel.r2 || sel.c1 !== sel.c2) {
					setChartPickAnchor({ key: pickKey, r, c });
					upsert(idx, { tableSelection: { blockId, r1: r, c1: c, r2: r, c2: c } });
					return;
				}
				setChartPickAnchor(null);
				const constrained = constrainTo2Axis(s.axisMode, { r1: sel.r1, c1: sel.c1, r2: r, c2: c });
				upsert(idx, { tableSelection: { blockId, ...constrained } });
				return;
			}

			if (e.shiftKey && anchor) {
				const constrained = constrainTo2Axis(s.axisMode, { r1: anchor.r, c1: anchor.c, r2: r, c2: c });
				upsert(idx, { tableSelection: { blockId, ...constrained } });
				return;
			}

			setChartPickAnchor({ key: pickKey, r, c });
			upsert(idx, { tableSelection: { blockId, r1: r, c1: c, r2: r, c2: c } });
		};

		return (
			<div className="flex flex-col gap-2">
				<div className="flex items-center gap-2 flex-wrap">
					<label className="text-xs text-zinc-600 dark:text-zinc-400">表格</label>
					<select
						value={blockId}
						onChange={(e) => {
							const nextId = e.target.value;
							if (!nextId) {
								upsert(idx, { tableSelection: undefined });
								return;
							}
							upsert(idx, { tableSelection: { blockId: nextId, r1: 0, r2: 9, c1: 0, c2: 1 } });
						}}
						className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
					>
						<option value="">请选择表格</option>
						{availableTables.map((t) => (
							<option key={t.id} value={t.id}>{t.label}</option>
						))}
					</select>

					<label className="text-xs text-zinc-600 dark:text-zinc-400 ml-2">X/Y 方向</label>
					<label className="text-xs flex items-center gap-1">
						<input
							type="radio"
							name={`hbar-axis-${block.id}-${idx}`}
							checked={s.axisMode === 'cols'}
							onChange={() => {
								const cur = s.tableSelection;
								if (!cur?.blockId) {
									upsert(idx, { axisMode: 'cols' });
									return;
								}
								const left = Math.min(cur.c1, cur.c2);
								upsert(idx, { axisMode: 'cols', tableSelection: { ...cur, c1: left, c2: left + 1 } });
							}}
						/>
						按列（X=左列，Y=右列）
					</label>
					<label className="text-xs flex items-center gap-1">
						<input
							type="radio"
							name={`hbar-axis-${block.id}-${idx}`}
							checked={s.axisMode === 'rows'}
							onChange={() => {
								const cur = s.tableSelection;
								if (!cur?.blockId) {
									upsert(idx, { axisMode: 'rows' });
									return;
								}
								const top = Math.min(cur.r1, cur.r2);
								upsert(idx, { axisMode: 'rows', tableSelection: { ...cur, r1: top, r2: top + 1 } });
							}}
						/>
						按行（X=上行，Y=下行）
					</label>

					<button
						type="button"
						onClick={() => applyLastTableSelectionToBarSeries(idx)}
						disabled={!lastTableSelection}
						className="ml-auto px-2 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-600 disabled:opacity-40"
						title={lastTableSelection ? '使用最近一次在表格块中框选的区域' : '请先在任意表格块中框选一块区域'}
					>
						使用最近选区
					</button>

					<button
						type="button"
						onClick={() => setChartSelectionMode((v) => !v)}
						className={`px-2 py-1 text-xs rounded flex items-center gap-1 border border-zinc-300 dark:border-zinc-600 transition-colors ${
							chartSelectionMode
								? 'bg-blue-500 hover:bg-blue-600 text-white'
								: 'bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-300'
						}`}
						title={chartSelectionMode ? '已开启：点击两次即可框选' : '开启：无需按 Shift 框选区域'}
					>
						<MousePointer2 size={14} />
						选区模式
					</button>
				</div>

				{tablePayload ? (
					<div className="text-[11px] text-zinc-500 dark:text-zinc-400">
						{chartSelectionMode
							? '选区模式：第一次点击设定起点；第二次点击设定终点。'
							: '普通模式：点击设定起点；Shift+点击设定终点。'} 会按上面的&quot;方向&quot;自动约束为 2 行或 2 列。
					</div>
				) : (
					<div className="text-[11px] text-zinc-500 dark:text-zinc-400">先选择一个表格。</div>
				)}

				{tablePayload ? (
					<div className="overflow-auto border border-zinc-200 dark:border-zinc-700 rounded max-h-72">
						<table className="w-full text-xs border-collapse">
							<tbody>
								{Array.from({ length: rows }, (_, r) => (
									<tr key={r}>
										{Array.from({ length: cols }, (_, c) => {
											const active = isInRect(r, c, sel);
											return (
												<td
													key={c}
													onMouseDown={(e) => pickCell(e, r, c)}
													className={`border border-zinc-200 dark:border-zinc-700 px-2 py-1 select-none cursor-pointer ${
														active ? 'bg-blue-100 dark:bg-blue-900/25' : 'bg-white dark:bg-zinc-950'
													}`}
													title={`R${r + 1}C${c + 1}`}
												>
													{getCellPlain(tablePayload, r, c)}
												</td>
											);
										})}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : null}
			</div>
		);
	};

	return (
		<div className="flex flex-col gap-3">
			<div className="text-[11px] text-zinc-500 dark:text-zinc-400">
				每个系列可独立选择手动或表格导入。
			</div>

			{anyManual ? (
				<div className="flex flex-col gap-2">
					<div className="text-[11px] text-zinc-500 dark:text-zinc-400">
						手动系列会使用下面这一行 X（分类，支持文本）；Y 必须是数值。
					</div>
					<div className="flex items-center gap-3 flex-wrap">
						<span className="text-xs text-zinc-600 dark:text-zinc-400">X</span>
						<label className="text-xs flex items-center gap-1">
							<input
								type="radio"
								name={`hbar-x-source-${block.id}`}
								checked={xSource === 'manual'}
								onChange={() => updateChart({ barXSource: 'manual' })}
							/>
							手动
						</label>
						<label className="text-xs flex items-center gap-1">
							<input
								type="radio"
								name={`hbar-x-source-${block.id}`}
								checked={xSource === 'table'}
								onChange={() => {
									const existing = chart.barXTableSelection;
									const fallbackTableId = availableTables[0]?.id ?? '';
									const nextSel = existing?.blockId
										? existing
										: (fallbackTableId
											? { blockId: fallbackTableId, r1: 0, r2: 0, c1: 0, c2: 9 }
											: undefined);
									updateChart({ barXSource: 'table', barXTableSelection: nextSel });
								}}
							/>
							表格
						</label>
					</div>

					{xSource === 'manual' ? renderXRow() : renderXTableSelector()}
				</div>
			) : (
				<div className="text-[11px] text-zinc-500 dark:text-zinc-400">
					表格系列：每个系列需要选一个 2 行/2 列区域：X 标签 + Y 数值。
				</div>
			)}

			{safeSeries.map((s, idx) => (
				<div key={idx} className="border border-zinc-200 dark:border-zinc-700 rounded p-2 flex flex-col gap-2">
					<div className="flex items-center gap-2">
						<span className="text-xs text-zinc-600 dark:text-zinc-400">系列 {idx + 1}</span>
						<input
							type="text"
							value={s.name}
							onChange={(e) => upsert(idx, { name: e.target.value })}
							className="flex-1 px-2 py-1 text-xs border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800"
							placeholder="系列名称（可选）"
						/>

						<label className="text-xs flex items-center gap-1">
							<input
								type="radio"
								name={`hbar-series-source-${block.id}-${idx}`}
								checked={(s.source ?? 'manual') === 'manual'}
								onChange={() => upsert(idx, { source: 'manual' })}
							/>
							手动
						</label>
						<label className="text-xs flex items-center gap-1">
							<input
								type="radio"
								name={`hbar-series-source-${block.id}-${idx}`}
								checked={(s.source ?? 'manual') === 'table'}
								onChange={() => {
									const existing = s.tableSelection;
									const fallbackTableId = availableTables[0]?.id ?? '';
									const nextSelection = existing?.blockId
										? existing
										: (fallbackTableId
											? { blockId: fallbackTableId, r1: 0, r2: 9, c1: 0, c2: 1 }
											: undefined);
									upsert(idx, { source: 'table', tableSelection: nextSelection });
								}}
							/>
							表格
						</label>
						{safeSeries.length > 1 && (
							<button
								type="button"
								onClick={() => removeSeries(idx)}
								className="px-2 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-600"
								title="删除该系列"
							>
								删除
							</button>
						)}
					</div>

					{(s.source ?? 'manual') === 'manual' ? renderYRow(s, idx) : renderTableSelector(s, idx)}
				</div>
			))}

			<div className="flex">
				<button
					type="button"
					onClick={addSeries}
					className="px-2 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-600"
				>
					+ 添加系列
				</button>
			</div>
		</div>
	);
}
