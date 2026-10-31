"use client";

import React, { useCallback, useState } from "react";
import { Controller, Control, FieldPath, FieldValues } from "react-hook-form";
import { LucideIcon, Upload, X, File } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

export interface FileUploaderProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  acceptTypes: string[];
  disabled?: boolean;
  icon: LucideIcon;
  placeholder: string;
  hint: string;
}

const FileUploader = <T extends FieldValues>({
  control,
  name,
  label,
  acceptTypes,
  disabled = false,
  icon: Icon = Upload,
  placeholder,
  hint,
}: FileUploaderProps<T>) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isImageFile = useCallback(() => {
    return acceptTypes.some((type) => type.startsWith("image/"));
  }, [acceptTypes]);

  const handleFileChange = useCallback(
    (file: File | undefined, onChange: (file: File | undefined) => void) => {
      setError(null);
      setPreviewUrl(null);

      if (!file) {
        onChange(undefined);
        return;
      }

      // Robust file type check (works across Windows MIME type gaps)
      const isPdfAccepted =
        acceptTypes.includes("application/pdf") &&
        (file.type === "application/pdf" ||
          file.name.toLowerCase().endsWith(".pdf"));
      const isImgAccepted =
        isImageFile() &&
        (file.type.startsWith("image/") ||
          /\.(jpe?g|png|webp)$/i.test(file.name));
      const isValid =
        acceptTypes.includes(file.type) || isPdfAccepted || isImgAccepted;

      if (!isValid) {
        setError(`Invalid file type. Accepted: ${acceptTypes.join(", ")}`);
        onChange(undefined);
        return;
      }

      // Create preview for images
      if (isImageFile() || /\.(jpe?g|png|webp)$/i.test(file.name)) {
        try {
          const url = URL.createObjectURL(file);
          setPreviewUrl(url);
        } catch {
          // Ignore preview generation failure
        }
      }

      onChange(file);
    },
    [acceptTypes, isImageFile],
  );

  const handleDrop = useCallback(
    (
      e: React.DragEvent<HTMLDivElement>,
      onChange: (file: File | undefined) => void,
    ) => {
      e.preventDefault();
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        handleFileChange(files[0], onChange);
      }
    },
    [handleFileChange],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const clearFile = useCallback(
    (onChange: (file: File | undefined) => void) => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setError(null);
      onChange(undefined);
    },
    [previewUrl],
  );

  return (
    <Controller
      control={control}
      name={name}
      render={({
        field: { onChange, value },
        fieldState: { error: fieldError },
      }) => {
        const file = value as File | undefined;
        const hasFile = !!file;
        const displayError = fieldError?.message || error;

        return (
          <div className="space-y-2">
            <label className="form-label">{label}</label>

            <div
              className={cn(
                "relative cursor-pointer rounded-lg border-2 border-dashed transition-all",
                hasFile
                  ? "border-green-500 bg-green-50/50"
                  : "border-gray-300 hover:border-gray-400",
                disabled && "cursor-not-allowed opacity-50",
                displayError && "border-red-500 bg-red-50/50",
              )}
              onDrop={(e) => !disabled && handleDrop(e, onChange)}
              onDragOver={handleDragOver}
            >
              <input
                type="file"
                accept={acceptTypes.join(",")}
                disabled={disabled}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                onChange={(e) => {
                  const files = e.target.files;
                  if (files && files.length > 0) {
                    handleFileChange(files[0], onChange);
                  }
                }}
              />

              <div className="flex flex-col items-center justify-center py-6 px-4">
                {hasFile && previewUrl ? (
                  // Image preview
                  <div className="relative w-full max-w-[200px]">
                    <Image
                      src={previewUrl}
                      alt="Cover preview"
                      width={200}
                      height={300}
                      className="w-full h-auto rounded-lg shadow-md"
                    />
                    {!disabled && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          clearFile(onChange);
                        }}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ) : hasFile ? (
                  // File info (non-image)
                  <div className="flex items-center gap-3 w-full max-w-[300px]">
                    <div className="p-3 bg-green-100 rounded-lg">
                      <File className="w-8 h-8 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {file?.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {file && (file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                    {!disabled && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          clearFile(onChange);
                        }}
                        className="p-2 text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                ) : (
                  // Upload placeholder
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-3 bg-gray-100 rounded-full">
                      <Icon className="w-6 h-6 text-gray-500" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-gray-700">
                        {placeholder}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">{hint}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {displayError && (
              <p className="text-xs text-red-500">{displayError}</p>
            )}
          </div>
        );
      }}
    />
  );
};

export default FileUploader;
