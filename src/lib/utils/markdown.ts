/**
 * Lightweight markdown-to-HTML for agent messages.
 * Process order: blocks → inline → paragraphs → cleanup.
 */

export function markdownToHtml(md: string): string {
  if (!md) return "";

  let html = md;

  // 1. Block: code blocks (before any other processing)
  html = html.replace(/```\n?([\s\S]*?)```/g, (_m, code) => {
    return `<pre class="bg-slate-100 dark:bg-slate-800 rounded-lg p-3 my-2 overflow-x-auto text-xs"><code>${escapeHtml(code.trim())}</code></pre>`;
  });

  // 2. Block: headings
  html = html.replace(/^#### (.+)$/gm, '<h5 class="font-medium text-xs mt-2 mb-1 text-slate-700 dark:text-slate-300">$1</h5>');
  html = html.replace(/^### (.+)$/gm, '<h4 class="font-medium text-sm mt-3 mb-1 text-slate-800 dark:text-slate-200">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 class="font-semibold text-sm mt-3 mb-1 text-slate-800 dark:text-slate-200">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2 class="font-semibold text-base mt-4 mb-2 text-slate-900 dark:text-slate-100">$1</h2>');

  // 3. Block: horizontal rule
  html = html.replace(/^---$/gm, '<hr class="my-2 border-slate-200 dark:border-slate-700" />');

  // 4. Block: unordered lists — wrap consecutive list items
  html = html.replace(/^[-*] (.+)$/gm, '<!--li-->$1<!--/li-->');
  html = html.replace(/((?:<!--li-->.*?<!--\/li-->\n?)+)/g, (m) => {
    const items = m.replace(/<!--li-->(.+?)<!--\/li-->/g, '<li class="ml-3 text-sm leading-relaxed">$1</li>');
    return `<ul class="space-y-0.5 my-1.5">${items}</ul>`;
  });

  // 5. Inline: bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>');

  // 6. Inline: inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-slate-100 dark:bg-slate-800 px-1 rounded text-xs font-mono">$1</code>');

  // 7. Inline: emoji symbols — keep as-is

  // 8. Paragraphs: split on double newlines
  const blocks = html.split(/\n\n+/);
  html = blocks
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      // Don't wrap if already a block element
      if (
        trimmed.startsWith("<h") ||
        trimmed.startsWith("<ul") ||
        trimmed.startsWith("<pre") ||
        trimmed.startsWith("<hr")
      ) {
        return trimmed;
      }
      // Wrap in paragraph, convert single newlines to <br>
      const withBreaks = trimmed.replace(/\n/g, "<br />");
      return `<p class="text-sm leading-relaxed">${withBreaks}</p>`;
    })
    .filter(Boolean)
    .join("\n");

  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
