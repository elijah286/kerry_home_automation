'use client';

// Minimal Markdown renderer: sanitised, escape-first, supports a tiny subset
// (headings, bold, italic, code, links, paragraphs, lists). We do NOT pull in
// a full Markdown lib here — the card is surface-level chrome, and a big dep
// for 50 lines of blog copy on a dashboard is a poor trade. If needs grow,
// swap in `marked` + `dompurify` behind this component.

import type { MarkdownCard as MarkdownCardDescriptor } from '@ha/shared';
import { token } from '@/lib/tokens';

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderInline(line: string): string {
  let out = escape(line);
  // Inline code
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold / italic
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // Link: [text](http(s)://...) — http(s) only for safety
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  return out;
}

function renderMarkdown(src: string): string {
  const lines = src.split(/\r?\n/);
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      html.push(`<ul>${list.map((l) => `<li>${renderInline(l)}</li>`).join('')}</ul>`);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushParagraph(); flushList(); continue; }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flushParagraph(); flushList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      list = list ?? [];
      list.push(bullet[1]);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph(); flushList();
  return html.join('\n');
}

export function MarkdownCard({ card }: { card: MarkdownCardDescriptor }) {
  const html = renderMarkdown(card.content);
  return (
    <div
      className="rounded-lg p-4"
      style={{ background: token('--color-bg-card'), color: token('--color-text'), border: `1px solid ${token('--color-border')}` }}
    >
      {card.title && (
        <h3 className="mb-2 text-base font-medium" style={{ color: token('--color-text') }}>
          {card.title}
        </h3>
      )}
      <div
        className="prose prose-sm max-w-none space-y-2 text-sm"
        // eslint-disable-next-line react/no-danger -- sanitised above: escape() on every user char, tags come only from our regexes
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
