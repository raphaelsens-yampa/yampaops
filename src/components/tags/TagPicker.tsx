import { useState, useMemo } from "react";
import { Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { TagChip } from "./TagChip";
import { useTags, useAddTagToOpportunity, useRemoveTagFromOpportunity, type Tag } from "@/hooks/useTags";
import { cn } from "@/lib/utils";

interface TagPickerProps {
  opportunityId: string;
  selectedTagIds: string[];
  onChange?: () => void;
  size?: "sm" | "default";
}

export function TagPicker({ opportunityId, selectedTagIds, onChange, size = "default" }: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const { data: tags = [] } = useTags();
  const addMut = useAddTagToOpportunity();
  const removeMut = useRemoveTagFromOpportunity();

  const selectedTags = useMemo(
    () => tags.filter((t) => selectedTagIds.includes(t.id)),
    [tags, selectedTagIds],
  );

  async function toggle(tag: Tag) {
    if (selectedTagIds.includes(tag.id)) {
      await removeMut.mutateAsync({ opportunityId, tagId: tag.id });
    } else {
      await addMut.mutateAsync({ opportunityId, tagId: tag.id });
    }
    onChange?.();
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selectedTags.map((t) => (
        <TagChip
          key={t.id}
          tag={t}
          size={size === "sm" ? "xs" : "sm"}
          onRemove={() => toggle(t)}
        />
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn("h-6 gap-1 text-xs px-2", size === "sm" && "h-5 text-[10px]")}
          >
            <Plus className="h-3 w-3" /> Tag
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar tag..." className="h-9" />
            <CommandList>
              <CommandEmpty>Nenhuma tag encontrada.</CommandEmpty>
              <CommandGroup>
                {tags.map((tag) => {
                  const active = selectedTagIds.includes(tag.id);
                  return (
                    <CommandItem key={tag.id} value={tag.name} onSelect={() => toggle(tag)}>
                      <Check className={cn("mr-2 h-3.5 w-3.5", active ? "opacity-100" : "opacity-0")} />
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-2"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="text-xs">{tag.name}</span>
                      {tag.is_system && (
                        <span className="ml-auto text-[9px] uppercase tracking-wider text-muted-foreground">sys</span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
