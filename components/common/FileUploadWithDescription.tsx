'use client';

import { useCallback, useState } from 'react';
import { Upload, X, FileText, Image as ImageIcon } from 'lucide-react';

interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  preview?: string;
  description?: string;
}

interface FileUploadWithDescriptionProps {
  onFilesChange: (files: UploadedFile[]) => void;
  accept?: string;
  maxSize?: number; // in bytes
  multiple?: boolean;
  label?: string;
  placeholder?: string;
}

export default function FileUploadWithDescription({
  onFilesChange,
  accept = 'image/*,.txt,.doc,.docx,.pdf',
  maxSize = 10 * 1024 * 1024, // 10MB
  multiple = true,
  label = '上传文件',
  placeholder = '点击或拖拽文件到此处',
}: FileUploadWithDescriptionProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFiles = useCallback(
    async (fileList: FileList) => {
      setError(null);
      const newFiles: UploadedFile[] = [];

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];

        if (file.size > maxSize) {
          setError(`文件 ${file.name} 超过大小限制 (${Math.round(maxSize / 1024 / 1024)}MB)`);
          continue;
        }

        const uploadedFile: UploadedFile = {
          id: `${Date.now()}-${i}-${Math.random()}`,
          name: file.name,
          type: file.type,
          size: file.size,
          description: '',
        };

        // Create preview for images
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (e) => {
            uploadedFile.preview = e.target?.result as string;
            setFiles((prev) => [...prev]);
          };
          reader.readAsDataURL(file);
        }

        newFiles.push(uploadedFile);
      }

      const updatedFiles = multiple ? [...files, ...newFiles] : newFiles;
      setFiles(updatedFiles);
      onFilesChange(updatedFiles);
    },
    [files, maxSize, multiple, onFilesChange]
  );

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        processFiles(e.dataTransfer.files);
      }
    },
    [processFiles]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        processFiles(e.target.files);
      }
    },
    [processFiles]
  );

  const removeFile = useCallback(
    (id: string) => {
      const updatedFiles = files.filter((f) => f.id !== id);
      setFiles(updatedFiles);
      onFilesChange(updatedFiles);
    },
    [files, onFilesChange]
  );

  const updateDescription = useCallback(
    (id: string, description: string) => {
      const updatedFiles = files.map((f) =>
        f.id === id ? { ...f, description } : f
      );
      setFiles(updatedFiles);
      onFilesChange(updatedFiles);
    },
    [files, onFilesChange]
  );

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-3">
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-lg p-4 transition-colors ${dragActive
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
          : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950'
          }`}
      >
        <input
          type="file"
          id={`file-upload-${label}`}
          className="hidden"
          accept={accept}
          multiple={multiple}
          onChange={handleChange}
        />
        <label
          htmlFor={`file-upload-${label}`}
          className="flex flex-col items-center justify-center cursor-pointer"
        >
          <Upload className="w-8 h-8 text-zinc-400 dark:text-zinc-600 mb-2" />
          <p className="text-sm text-zinc-600 dark:text-zinc-400 text-center">
            {placeholder}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
            支持图片、文本、PDF 等格式，最大 {Math.round(maxSize / 1024 / 1024)}MB
          </p>
        </label>
      </div>

      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded px-3 py-2">
          {error}
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-3">
          {files.map((file) => (
            <div
              key={file.id}
              className="p-3 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg space-y-2"
            >
              <div className="flex items-center gap-3">
                {file.preview ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={file.preview} alt={file.name} className="w-12 h-12 object-cover rounded" />
                  </>
                ) : file.type.startsWith('image/') ? (
                  <ImageIcon className="w-12 h-12 text-zinc-400 flex-shrink-0" />
                ) : (
                  <FileText className="w-12 h-12 text-zinc-400 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-500">{formatFileSize(file.size)}</p>
                </div>
                <button
                  onClick={() => removeFile(file.id)}
                  className="p-1 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors flex-shrink-0"
                >
                  <X size={18} />
                </button>
              </div>
              <textarea
                value={file.description || ''}
                onChange={(e) => updateDescription(file.id, e.target.value)}
                placeholder="为这个文件添加描述..."
                className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={2}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
