import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tag } from "@/hooks/useTags";

interface TagChipProps {
  tag: Tag;
  size?: "xs" | "sm";
  onRemove?: () => void;
  className?: string;
}

// Convert hex to rgba with alpha for soft background
function softBg(hex: string, alpha = 0.15): string {
  const m = /^#?([a-f\d]{6})$/i.exec(hex);
  if (!m) return `rgba(59,130,246,${alpha})`;
  const num = parseInt(m[1], 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function TagChip({ tag, size = "sm", onRemove, className }: TagChipProps) {
  const sizeCls = size === "xs"
    ? "text-[10px] px-1.5 py-0 h-4 gap-1"
    : "text-xs px-2 py-0.5 h-5 gap-1";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium border",
        sizeCls,
        className,
      )}
      style={{
        color: tag.color,
        borderColor: softBg(tag.color, 0.4),
        backgroundColor: softBg(tag.color, 0.12),
      }}
      title={tag.description || tag.name}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: tag.color }}
      />
      <span className="truncate max-w-[140px]">{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="hover:bg-black/10 rounded-full p-0.5 transition-colors"
          aria-label={`Remover tag ${tag.name}`}
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}
