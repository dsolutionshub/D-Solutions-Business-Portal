import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, Link2, List, ListOrdered, RemoveFormatting, Underline } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Email body editor (TipTap): bold, italic, underline, lists, links (http/https only) and
 * "clear formatting" — the prototype's toolbar. Works on HTML in and out; the server sanitizes
 * whatever it receives anyway.
 */
export function RichTextEditor({
  value,
  onChange,
  invalid,
  label = 'Message',
  id,
  onReady
}: {
  value: string;
  onChange: (html: string) => void;
  invalid?: boolean;
  label?: string;
  id?: string;
  /** gives the editor to the parent, e.g. to insert {{variables}} at the cursor */
  onReady?: (editor: Editor) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          protocols: ['http', 'https', 'mailto'],
          defaultProtocol: 'https'
        }
      })
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'email-body min-h-[220px] px-3 py-2.5 text-sm outline-none',
        'aria-label': label,
        'aria-multiline': 'true',
        role: 'textbox',
        ...(id ? { id } : {})
      }
    },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? '' : e.getHTML())
  });

  useEffect(() => {
    if (editor) onReady?.(editor);
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  // replace the content when it changes from outside (template applied, prefill loaded)
  useEffect(() => {
    if (editor && value !== editor.getHTML() && !(value === '' && editor.isEmpty))
      editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return <div className="min-h-[260px] rounded-md border bg-muted/40" aria-busy />;

  const link = () => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL (https://…)', prev ?? 'https://');
    if (url === null) return;
    if (!url.trim() || url.trim() === 'https://') return void editor.chain().focus().unsetLink().run();
    if (!/^https?:\/\//i.test(url.trim()))
      return void window.alert('Links must start with http:// or https://');
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border bg-background focus-within:ring-1 focus-within:ring-ring',
        invalid && 'border-destructive'
      )}
    >
      <div className="flex flex-wrap gap-0.5 border-b bg-muted/40 p-1" role="toolbar" aria-label="Formatting">
        <Tool
          label="Bold"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold />
        </Tool>
        <Tool
          label="Italic"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic />
        </Tool>
        <Tool
          label="Underline"
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <Underline />
        </Tool>
        <Tool
          label="Bulleted list"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List />
        </Tool>
        <Tool
          label="Numbered list"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered />
        </Tool>
        <Tool label="Insert link" active={editor.isActive('link')} onClick={link}>
          <Link2 />
        </Tool>
        <Tool
          label="Clear formatting"
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
        >
          <RemoveFormatting />
        </Tool>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function Tool({
  label,
  active,
  onClick,
  children
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex size-8 items-center justify-center rounded text-subtle-foreground hover:bg-accent [&_svg]:size-4',
        active && 'bg-card text-foreground shadow-sm'
      )}
    >
      {children}
    </button>
  );
}
