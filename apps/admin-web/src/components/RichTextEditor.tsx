import { useRef } from "react";
import { htmlToWhatsAppMarkup } from "./htmlToWhatsAppMarkup";

interface RichTextEditorProps {
  onChange: (markupText: string) => void;
  /** Returns the `{{n}}` token to insert at the cursor; also a hook for the
   * caller to register a new variable slot alongside it. */
  onInsertVariable?: () => string;
  placeholder?: string;
}

/** A contentEditable rich-text editor for WhatsApp template bodies. Admins get
 * a familiar bold/italic/list toolbar; behind the scenes every edit is
 * converted to WhatsApp's own markup (*bold*, _italic_, ~strikethrough~) via
 * htmlToWhatsAppMarkup, since that's the only formatting a customer's phone
 * will actually render. Deliberately uncontrolled (the DOM owns its content,
 * we only read it on input) to avoid the classic contentEditable+React
 * cursor-jump problem that comes from re-rendering innerHTML on every keystroke. */
export function RichTextEditor({ onChange, onInsertVariable, placeholder }: RichTextEditorProps) {
  const editableRef = useRef<HTMLDivElement>(null);

  function emitChange() {
    if (editableRef.current) onChange(htmlToWhatsAppMarkup(editableRef.current.innerHTML));
  }

  function exec(command: string) {
    editableRef.current?.focus();
    document.execCommand(command);
    emitChange();
  }

  function insertVariable() {
    if (!onInsertVariable) return;
    const token = onInsertVariable();
    editableRef.current?.focus();
    document.execCommand("insertText", false, token);
    emitChange();
  }

  return (
    <div className="rte">
      <div className="rte-toolbar">
        <button
          type="button"
          className="secondary"
          title="Bold"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("bold")}
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          className="secondary"
          title="Italic"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("italic")}
        >
          <em>I</em>
        </button>
        <button
          type="button"
          className="secondary"
          title="Strikethrough"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("strikeThrough")}
        >
          <s>S</s>
        </button>
        <button
          type="button"
          className="secondary"
          title="Bulleted list"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("insertUnorderedList")}
        >
          • List
        </button>
        {onInsertVariable && (
          <button
            type="button"
            className="secondary"
            title="Insert variable placeholder"
            onMouseDown={(e) => e.preventDefault()}
            onClick={insertVariable}
          >
            + Variable
          </button>
        )}
      </div>
      <div
        ref={editableRef}
        className="rte-editable"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={emitChange}
        onBlur={emitChange}
      />
    </div>
  );
}
