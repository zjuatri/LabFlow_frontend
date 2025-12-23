import { getToken } from './auth';

export type CropPixels = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ImageSize = {
  width: number;
  height: number;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export async function cropImageOnServer(args: {
  projectId: string;
  imageUrl: string;
  cropPixels: CropPixels;
  imageSize: ImageSize;
}): Promise<{ url: string }> {
  const { projectId, imageUrl, cropPixels, imageSize } = args;

  // Convert pixels -> percent for backend
  const cropX = (cropPixels.x / imageSize.width) * 100;
  const cropY = (cropPixels.y / imageSize.height) * 100;
  const cropWidth = (cropPixels.width / imageSize.width) * 100;
  const cropHeight = (cropPixels.height / imageSize.height) * 100;

  const token = getToken();
  const res = await fetch(`/api/projects/${projectId}/images/crop`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      image_url: imageUrl,
      crop_x: clamp(cropX, 0, 100),
      crop_y: clamp(cropY, 0, 100),
      crop_width: clamp(cropWidth, 0, 100),
      crop_height: clamp(cropHeight, 0, 100),
      image_width: imageSize.width,
      image_height: imageSize.height,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.detail || '裁剪失败');
  }

  return (await res.json()) as { url: string };
}
