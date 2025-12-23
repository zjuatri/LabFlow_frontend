'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';

export type CropResult = {
  cropPixels: { x: number; y: number; width: number; height: number };
  imageSize: { width: number; height: number };
};

function makeInitialCrop(): Crop {
  // Default crop is the entire image.
  return {
    unit: '%',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  };
}

export default function ImageCropper(props: {
  imageUrl: string;
  onChange: (result: CropResult | null) => void;
}) {
  const { imageUrl, onChange } = props;

  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(null);

  const result: CropResult | null = useMemo(() => {
    if (!completedCrop || !imageSize || !displaySize) return null;
    if (!completedCrop.width || !completedCrop.height) return null;

    // completedCrop is in *rendered* pixels. Convert to natural image pixels.
    const scaleX = imageSize.width / Math.max(1, displaySize.width);
    const scaleY = imageSize.height / Math.max(1, displaySize.height);

    return {
      cropPixels: {
        x: Math.round(completedCrop.x * scaleX),
        y: Math.round(completedCrop.y * scaleY),
        width: Math.round(completedCrop.width * scaleX),
        height: Math.round(completedCrop.height * scaleY),
      },
      imageSize,
    };
  }, [completedCrop, displaySize, imageSize]);

  useEffect(() => {
    onChange(result);
  }, [result, onChange]);

  return (
    <div className="w-full">
      <ReactCrop
        crop={crop}
        onChange={(next) => setCrop(next)}
        onComplete={(c) => setCompletedCrop(c)}
        keepSelection
        ruleOfThirds
      >
        {/* Image stays still; only crop rect is resized/moved */}
        <img
          src={imageUrl}
          alt="待裁剪图片"
          className="max-h-[55vh] w-auto max-w-full object-contain"
          onLoad={(e) => {
            const img = e.currentTarget;
            setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
            // Rendered size (after CSS) is used to scale pixel crops back to natural pixels.
            setDisplaySize({ width: img.width, height: img.height });
            setCrop((prev) => prev ?? makeInitialCrop());
          }}
        />
      </ReactCrop>

      <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        提示：拖拽裁剪框边/角调整宽高；拖拽框内部移动位置；图片不会跟着动
      </div>
    </div>
  );
}
