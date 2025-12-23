'use client';

import { TypstBlock } from '@/lib/typst';
import Image from 'next/image';
import { useState } from 'react';
import ImageCropModal from '../ImageCropModal';

interface ImageBlockEditorProps {
  block: TypstBlock;
  onUpdate: (updates: Partial<TypstBlock>) => void;
  onUploadImage: (file: File) => Promise<void>;
}

export default function ImageBlockEditor({ block, onUpdate, onUploadImage }: ImageBlockEditorProps) {
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);

  const handleCropComplete = async (croppedImageUrl: string) => {
    onUpdate({ content: croppedImageUrl });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* 图片预览 */}
      {block.content ? (
        <div className="flex items-center gap-3">
          <Image
            src={block.content}
            alt="图片预览"
            width={400}
            height={300}
            className="max-h-40 max-w-full h-auto w-auto object-contain rounded border border-zinc-200 dark:border-zinc-700"
            unoptimized
          />
          <button
            onClick={() => setIsCropModalOpen(true)}
            className="px-2 py-1 text-xs rounded bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/40"
          >
            编辑图片
          </button>
        </div>
      ) : null}

      {/* 图片说明 */}
      <div>
        <input
          type="text"
          value={block.caption ?? ''}
          onChange={(e) => onUpdate({ caption: e.target.value })}
          className="w-full p-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
          placeholder="例如：实验装置示意图"
        />
      </div>

      {/* 上传图片按钮 */}
      <label className="inline-block px-4 py-2 rounded bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium cursor-pointer transition-colors">
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
        {block.content ? '更换图片' : '选择图片'}
      </label>

      {/* 宽度滑块 */}
      {block.content && (
        <div>
          <label className="text-xs text-zinc-600 dark:text-zinc-400 block mb-2">
            宽度: {(() => {
              const w = block.width || '100%';
              return parseFloat(w) || 100;
            })()}%
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={(() => {
              const w = block.width || '100%';
              return parseFloat(w) || 100;
            })()}
            onChange={(e) => {
              const val = e.target.value;
              onUpdate({ width: `${val}%` });
            }}
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
