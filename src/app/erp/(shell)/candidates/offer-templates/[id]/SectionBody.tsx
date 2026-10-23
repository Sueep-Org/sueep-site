"use client";

import { useEffect } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { BlankNode, docToText, textToDoc } from "./letterDoc";

/** One section's text, edited in place on the letter. */
export function SectionBody({
  text,
  editable,
  placeholder,
  onChange,
  onFocus,
}: {
  text: string;
  editable: boolean;
  placeholder: string;
  onChange: (text: string) => void;
  onFocus: (editor: Editor) => void;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      // Only what the saved format and the PDF support: paragraphs, line breaks, bullets, bold.
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        code: false,
        italic: false,
        strike: false,
        orderedList: false,
      }),
      BlankNode,
    ],
    content: textToDoc(text),
    editorProps: {
      attributes: {
        class:
          "min-h-[1.5em] rounded outline-none transition-colors hover:bg-pink-50/40 focus:bg-pink-50/40 [&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-8 [&_li_p]:my-0",
        "data-placeholder": placeholder,
      },
    },
    onUpdate: ({ editor }) => onChange(docToText(editor.getJSON())),
    onFocus: ({ editor }) => onFocus(editor),
  });

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  if (!editor) return <div className="min-h-[1.5em]" />;
  const empty = editor.isEmpty;
  return (
    <div className="relative">
      {empty ? (
        <span className="pointer-events-none absolute left-0 top-3 text-gray-300">{placeholder}</span>
      ) : null}
      <EditorContent editor={editor} />
    </div>
  );
}
