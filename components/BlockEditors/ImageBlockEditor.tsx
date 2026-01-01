'use client';

import { TypstBlock } from '@/lib/typst';
import Image from 'next/image';
import { useState } from 'react';
import ImageCropModal from '../ImageCropModal';
import { ImageOff } from 'lucide-react';

interface ImageBlockEditorProps {
  block: TypstBlock;
  onUpdate: (updates: Partial<TypstBlock>) => void;
  onUploadImage: (file: File) => Promise<void>;
}

export default function ImageBlockEditor({ block, onUpdate, onUploadImage }: ImageBlockEditorProps) {
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [imageError, setImageError] = useState(false);

  const handleCropComplete = async (croppedImageUrl: string) => {
    onUpdate({ content: croppedImageUrl });
    setImageError(false); // Reset error state on new crop
  };

  const alignClass =
    (block.align || 'center') === 'left' ? 'justify-start' :
      (block.align || 'center') === 'right' ? 'justify-end' : 'justify-center';

  // Reset error state when block.content changes
  const handleImageError = () => {
    setImageError(true);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* 图片预览 */}
      {block.content ? (
        block.content.startsWith('[[') ? (
          // Placeholder UI
          <div className="flex flex-col gap-3 p-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg border-2 border-dashed border-blue-200 dark:border-blue-800 items-center text-center">
            <div className="text-blue-500 dark:text-blue-400 font-medium text-lg">
              {block.content.match(/\[\[\s*IMAGE_PLACEHOLDER\s*:\s*(.*?)\s*\]\]/i)?.[1] || '点击此处上传图片'}
            </div>
            <div className="text-xs text-blue-400 dark:text-blue-500/70 mb-2">
              (AI 生成的图片占位符)
            </div>
            <label className="px-4 py-2 text-sm rounded-full bg-blue-500 hover:bg-blue-600 text-white cursor-pointer transition-colors shadow-sm">
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    try {
                      await onUploadImage(file);
                      setImageError(false);
                    } catch (err) {
                      alert(err instanceof Error ? err.message : '上传失败');
                    }
                  }
                }}
                className="hidden"
              />
              上传图片
            </label>
          </div>
        ) : imageError ? (
          // Fallback UI for broken image
          <div className="flex flex-col gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
            <div className={`flex ${alignClass} items-center gap-2 text-red-600 dark:text-red-400`}>
              <ImageOff size={24} />
              <span className="font-medium">图片加载失败</span>
            </div>
            <div className="text-xs text-red-500 dark:text-red-400 font-mono break-all bg-red-100 dark:bg-red-900/30 p-2 rounded">
              {block.content}
            </div>
            <label className="px-3 py-2 text-sm rounded bg-blue-500 hover:bg-blue-600 text-white text-center cursor-pointer transition-colors">
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    try {
                      await onUploadImage(file);
                      setImageError(false);
                    } catch (err) {
                      alert(err instanceof Error ? err.message : '上传失败');
                    }
                  }
                }}
                className="hidden"
              />
              上传替换图片
            </label>
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-3 bg-zinc-50 dark:bg-zinc-800 rounded border border-zinc-200 dark:border-zinc-700">
            <div className={`flex ${alignClass}`}>
              <Image
                src={block.content}
                alt="图片预览"
                width={400}
                height={300}
                className="max-h-48 max-w-full h-auto w-auto object-contain rounded"
                unoptimized
                onError={handleImageError}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setIsCropModalOpen(true)}
                className="flex-1 px-3 py-2 text-sm rounded bg-blue-500 hover:bg-blue-600 text-white transition-colors"
              >
                编辑图片
              </button>
              <label className="flex-1 px-3 py-2 text-sm rounded bg-green-500 hover:bg-green-600 text-white text-center cursor-pointer transition-colors">
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      try {
                        await onUploadImage(file);
                      } catch (err) {
                        alert(err instanceof Error ? err.message : '上传失败');
                      }
                    }
                  }}
                  className="hidden"
                />
                更换图片
              </label>
            </div>
          </div>
        )
      ) : (
        <label className="px-4 py-8 rounded border-2 border-dashed border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 hover:border-blue-400 dark:hover:border-blue-500 text-center cursor-pointer transition-colors">
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) {
                try {
                  await onUploadImage(file);
                } catch (err) {
                  alert(err instanceof Error ? err.message : '上传失败');
                }
              }
            }}
            className="hidden"
          />
          <div className="text-blue-500 dark:text-blue-400 font-medium">选择图片</div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">点击上传图片文件</div>
        </label>
      )}

      {/* 图片说明 */}
      <input
        type="text"
        value={block.caption ?? ''}
        onChange={(e) => onUpdate({ caption: e.target.value })}
        className="w-full p-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
        placeholder="例如：实验装置示意图"
      />

      {/* 对齐方式 */}
      {block.content && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-600 dark:text-zinc-400">对齐：</label>
          <div className="flex gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onUpdate({ align: 'left' }); }}
              className={`px-3 py-1 text-xs rounded transition-colors ${(block.align || 'center') === 'left'
                ? 'bg-blue-500 text-white'
                : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600'
                }`}
            >
              居左
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onUpdate({ align: 'center' }); }}
              className={`px-3 py-1 text-xs rounded transition-colors ${(block.align || 'center') === 'center'
                ? 'bg-blue-500 text-white'
                : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600'
                }`}
            >
              居中
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onUpdate({ align: 'right' }); }}
              className={`px-3 py-1 text-xs rounded transition-colors ${(block.align || 'center') === 'right'
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
      {block.content && (
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
      )}

      {/* Image Crop Modal */}
      {block.content && (
        <ImageCropModal
          isOpen={isCropModalOpen}
          imageUrl={block.content}
          onClose={() => setIsCropModalOpen(false)}
          onCropComplete={handleCropComplete}
        />
      )}
    </div>
  );
}
