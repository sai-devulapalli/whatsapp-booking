// WhatsApp messages render none of HTML — only its own lightweight markup
// (*bold*, _italic_, ~strikethrough~, `monospace`). This walks the DOM tree
// produced by a contentEditable rich-text editor and converts it to that
// markup, so admins get a familiar rich-text editing experience while what's
// actually stored/sent is exactly what a customer's phone will render.

const NBSP = String.fromCharCode(160);

function wrapNonEmpty(text: string, marker: string): string {
  if (!text.trim()) return text;
  return `${marker}${text}${marker}`;
}

function walk(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as HTMLElement;
  const inner = Array.from(el.childNodes).map(walk).join("");

  switch (el.tagName.toLowerCase()) {
    case "b":
    case "strong":
      return wrapNonEmpty(inner, "*");
    case "i":
    case "em":
      return wrapNonEmpty(inner, "_");
    case "s":
    case "strike":
    case "del":
      return wrapNonEmpty(inner, "~");
    case "code":
      return wrapNonEmpty(inner, "`");
    case "li":
      return `- ${inner}\n`;
    case "br":
      return "\n";
    case "div":
    case "p":
      return `${inner}\n`;
    default:
      return inner;
  }
}

export function htmlToWhatsAppMarkup(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = html;
  const raw = walk(container);

  return raw
    .split(NBSP)
    .join(" ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}
