import { useState, useRef } from 'react';
import { Eye, Pencil, Upload } from 'lucide-react';
import { attachments as attachmentsApi } from '@/lib/api';
import MarkdownViewer from './MarkdownViewer';
import { Button } from '@/components/ui/button';

interface MarkdownEditorProps {
  value: string;
  onChange: (v: string) => void;
  issueCode?: string;
}

export default function MarkdownEditor({ value, onChange, issueCode }: MarkdownEditorProps) {
  const [preview, setPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const insertAtCursor = (before: string, after = '') => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);
    const newVal = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(newVal);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };

  const uploadImage = async (file: File) => {
    if (!issueCode) return;
    const attachment = await attachmentsApi.upload(issueCode, file);
    const url = attachmentsApi.getUrl(attachment.id);
    const md = `![${attachment.filename}](${url})`;
    const el = textareaRef.current;
    if (!el) { onChange(value + '\n' + md); return; }
    const pos = el.selectionStart;
    onChange(value.slice(0, pos) + md + value.slice(pos));
  };

  return (
    <div className="border rounded-md overflow-hidden">
      <div className="flex items-center gap-1 px-2 py-1 border-b bg-muted/40">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs px-2"
          onClick={() => insertAtCursor('**', '**')}
        >B</Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs px-2 italic"
          onClick={() => insertAtCursor('_', '_')}
        >I</Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs px-2 font-mono"
          onClick={() => insertAtCursor('`', '`')}
        >`</Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs px-2"
          onClick={() => insertAtCursor('\n- ')}
        >List</Button>
        {issueCode && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 ml-1"
            onClick={() => fileRef.current?.click()}
            title="Upload image"
          >
            <Upload className="size-3" />
          </Button>
        )}
        <div className="flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => setPreview(p => !p)}
        >
          {preview ? <><Pencil className="size-3" /> Edit</> : <><Eye className="size-3" /> Preview</>}
        </Button>
      </div>

      {preview ? (
        <div className="p-3 min-h-[150px]">
          {value ? <MarkdownViewer content={value} /> : (
            <p className="text-muted-foreground text-sm italic">Nothing to preview.</p>
          )}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          className="w-full min-h-[150px] p-3 text-sm bg-transparent resize-y focus-visible:outline-none font-mono"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Write with **markdown**…"
        />
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) uploadImage(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
