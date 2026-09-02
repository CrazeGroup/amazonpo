import React, { useRef, useState } from 'react';
import { UploadCloud, CheckCircle2, FileSpreadsheet, X } from 'lucide-react';

interface FileUploadProps {
  label: string;
  subLabel?: string;
  accept?: string;
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
  required?: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ 
  label, 
  subLabel, 
  accept = ".xlsx, .xls", 
  onFileSelect, 
  selectedFile,
  required
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    onFileSelect(null);
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] uppercase font-bold text-gray-600 flex justify-between tracking-wide">
        <span className="truncate">{label} {required && <span className="text-red-500">*</span>}</span>
        {selectedFile && (
          <span className="text-emerald-700 font-semibold text-[10px] flex items-center gap-0.5">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Loaded
          </span>
        )}
      </label>
      <div 
        onClick={() => inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          border-2 rounded-lg px-3 py-2 cursor-pointer transition-all duration-150 flex items-center justify-between min-h-[50px]
          ${isDragging 
            ? 'border-amazon-blue bg-blue-50/80 ring-2 ring-amazon-blue/20' 
            : selectedFile 
              ? 'border-emerald-400 bg-emerald-50/50 hover:bg-emerald-50' 
              : 'border-dashed border-gray-300 hover:border-amazon-blue bg-white hover:bg-gray-50/70'}
        `}
      >
        <input 
          type="file" 
          ref={inputRef}
          accept={accept} 
          onChange={handleChange} 
          className="hidden" 
        />
        {selectedFile ? (
          <div className="flex items-center justify-between gap-2 text-emerald-800 w-full overflow-hidden">
            <div className="flex items-center gap-2 truncate">
              <FileSpreadsheet className="w-4 h-4 flex-shrink-0 text-emerald-600" />
              <span className="font-medium truncate text-xs" title={selectedFile.name}>
                {selectedFile.name}
              </span>
            </div>
            <button 
              type="button"
              onClick={handleRemove}
              title="Remove file"
              className="p-1 text-gray-400 hover:text-red-600 rounded-full hover:bg-red-50 transition-colors flex-shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between w-full text-gray-400">
            <div className="flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-medium text-gray-600">
                {isDragging ? 'Drop file here' : 'Select or drop'}
              </span>
            </div>
            {subLabel && (
              <span className="text-[10px] hidden sm:inline text-gray-400 font-medium">
                {subLabel}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};