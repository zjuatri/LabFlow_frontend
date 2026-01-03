'use client';

import { useCallback, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import ImageCropper, { type CropResult } from './ImageCropper';
import { cropImageOnServer } from '@/lib/image-crop';

interface ImageCropModalProps {
  isOpen: boolean;
  imageUrl: string;
  onClose: () => void;
  onCropComplete: (croppedImageUrl: string) => Promise<void>;
}

export default function ImageCropModal({
  isOpen,
  imageUrl,
  onClose,
  onCropComplete,
}: ImageCropModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [cropResult, setCropResult] = useState<CropResult | null>(null);

  const projectId = useMemo(() => {
    const urlParts = imageUrl.split('/');
    const projectIdIndex = urlParts.indexOf('projects');
    if (projectIdIndex === -1 || projectIdIndex + 1 >= urlParts.length) return null;
    return urlParts[projectIdIndex + 1];
  }, [imageUrl]);

  const handleCropConfirm = useCallback(async () => {
    if (!cropResult) return;
    if (!projectId) {
      alert('Invalid image URL');
      return;
    }

    setIsProcessing(true);
    try {
      const data = await cropImageOnServer({
        projectId,
        imageUrl,
        cropPixels: cropResult.cropPixels,
        imageSize: cropResult.imageSize,
      });

      // Force refresh by adding timestamp
      const baseUrl = data.url.split('?')[0];
      const newUrl = `${baseUrl}?t=${Date.now()}`;
      await onCropComplete(newUrl);
      onClose();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to crop image');
    } finally {
      setIsProcessing(false);
    }
  }, [cropResult, projectId, imageUrl, onCropComplete, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex flex-col gap-4 rounded-lg bg-white dark:bg-zinc-900 w-full max-w-2xl max-h-[90vh] p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            编辑图片
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cropper Container */}
        <div className="bg-zinc-100 dark:bg-zinc-800 rounded overflow-hidden p-2">
          <ImageCropper imageUrl={imageUrl} onChange={setCropResult} />
        </div>

        {/* Footer Actions */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-300 dark:hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleCropConfirm}
            disabled={isProcessing || !cropResult}
            className="px-4 py-2 rounded bg-blue-500 hover:bg-blue-600 disabled:bg-blue-400 text-white font-medium disabled:cursor-not-allowed transition-colors"
          >
            {isProcessing ? '处理中...' : '确认裁剪'}
          </button>
        </div>
      </div>
    </div>
  );
}
