import { useState } from "react";
import { Check, Plus, Tag as TagIcon, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useCsTagMutations, type CsTag } from "@/hooks/useCsTags";

const PALETTE = ["#01B8E0", "#2D094C", "#16A34A", "#F59E0B", "#DC2626", "#7C3AED", "#DB2777", "#64748B"];

export function CsTagChip({ tag, onRemove }: { tag: CsTag; onRemove?: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 h-5 text-[11px] font-medium"
      style={{ color: tag.color, borderColor: `${tag.color}66`, backgroundColor: `${tag.color}1f` }}
    >
      <span className="truncate max-w-[110px]">{tag.name}</span>
      {onRemove && (
        <button type="button" aria-label={`Remover tag ${tag.name}`} onClick={(e) => { e.stopPropagation(); onRemove(); }}>
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}

/** Seletor que aplica tags a um ou mais clientes e permite criar novas tags. */
export function CsTagPicker({
  tags, emails, selectedIds = [], trigger, onToggle,
}: {
  tags: CsTag[];
  emails: string[];
  selectedIds?: string[];
  trigger?: React.ReactNode;
  onToggle?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { create, attach, detach } = useCsTagMutations();
  const single = emails.length === 1;

  async function toggle(tag: CsTag) {
    try {
      if (single && selectedIds.includes(tag.id)) await detach.mutateAsync({ email: emails[0], tagId: tag.id });
      else {
        await attach.mutateAsync({ emails, tagId: tag.id });
        if (!single) toast.success(`Tag "${tag.name}" aplicada a ${emails.length} cliente(s)`);
      }
      onToggle?.();
    } catch (e: any) { toast.error(e.message); }
  }

  async function createAndApply() {
    const name = search.trim();
    if (!name) return;
    try {
      const color = PALETTE[tags.length % PALETTE.length];
      const t = await create.mutateAsync({ name, color });
      await attach.mutateAsync({ emails, tagId: t.id });
      setSearch("");
      toast.success(`Tag "${name}" criada`);
    } catch (e: any) {
      toast.error(e.message?.includes("duplicate") ? "Já existe uma tag com esse nome" : e.message);
    }
  }

  const exists = tags.some((t) => t.name.toLowerCase() === search.trim().toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
        {trigger ?? (
          <Button variant="outline" size="sm" className="h-5 px-1.5 text-[10px] gap-0.5">
            <Plus className="h-3 w-3" /> Tag
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start" onClick={(e) => e.stopPropagation()}>
        <Command>
          <CommandInput placeholder="Buscar ou criar tag..." value={search} onValueChange={setSearch} className="h-9" />
          <CommandList>
            <CommandEmpty>Nenhuma tag encontrada.</CommandEmpty>
            <CommandGroup>
              {tags.map((t) => (
                <CommandItem key={t.id} value={t.name} onSelect={() => toggle(t)}>
                  <Check className={cn("mr-2 h-3.5 w-3.5", single && selectedIds.includes(t.id) ? "opacity-100" : "opacity-0")} />
                  <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: t.color }} />
                  <span className="text-xs">{t.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {search.trim() && !exists && (
            <button
              type="button"
              className="w-full border-t px-3 py-2 text-left text-xs hover:bg-muted flex items-center gap-1"
              onClick={createAndApply}
              disabled={create.isPending}
            >
              <Plus className="h-3 w-3" /> Criar tag "{search.trim()}"
            </button>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function ClientTagsCell({ email, tags, clientTagIds }: { email: string; tags: CsTag[]; clientTagIds: string[] }) {
  const { detach } = useCsTagMutations();
  const mine = tags.filter((t) => clientTagIds.includes(t.id));
  return (
    <div className="flex flex-wrap items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {mine.map((t) => (
        <CsTagChip key={t.id} tag={t} onRemove={() => detach.mutate({ email, tagId: t.id })} />
      ))}
      <CsTagPicker tags={tags} emails={[email]} selectedIds={clientTagIds} />
    </div>
  );
}

/** Gestão de tags (excluir). */
export function CsTagsManager({ tags }: { tags: CsTag[] }) {
  const { remove } = useCsTagMutations();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9"><TagIcon className="h-4 w-4 mr-1" /> Tags</Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <p className="text-sm font-medium mb-2">Tags da carteira</p>
        {tags.length === 0 && <p className="text-xs text-muted-foreground">Crie tags pelo botão "+ Tag" em cada cliente.</p>}
        <div className="space-y-1">
          {tags.map((t) => (
            <div key={t.id} className="flex items-center justify-between">
              <CsTagChip tag={t} />
              <Button
                variant="ghost" size="icon" className="h-7 w-7"
                aria-label={`Excluir tag ${t.name}`}
                onClick={() => { if (confirm(`Excluir a tag "${t.name}" de todos os clientes?`)) remove.mutate(t.id); }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
