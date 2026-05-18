"use client";

import React from "react";

/**
 * Renders agent message text from the API.
 * Parses simple markdown into styled React components.
 * No dangerouslySetInnerHTML needed.
 */
export function MessageContent({ text }: { text: string }) {
  if (!text) return null;

  const lines = text.split("\n");

  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Empty line → spacing
    if (!trimmed) {
      elements.push(<div key={i} className="h-2" />);
      continue;
    }

    // ### Heading
    if (trimmed.startsWith("### ")) {
      elements.push(
        <div key={i} className="font-semibold text-sm text-slate-700 dark:text-slate-300 mt-2 mb-1">
          {renderInline(trimmed.slice(4))}
        </div>
      );
      continue;
    }

    // ## Heading
    if (trimmed.startsWith("## ")) {
      elements.push(
        <div key={i} className="font-semibold text-base text-slate-800 dark:text-slate-200 mt-2 mb-1">
          {renderInline(trimmed.slice(3))}
        </div>
      );
      continue;
    }

    // # Heading
    if (trimmed.startsWith("# ")) {
      elements.push(
        <div key={i} className="font-semibold text-lg text-slate-900 dark:text-slate-100 mt-3 mb-1.5">
          {renderInline(trimmed.slice(2))}
        </div>
      );
      continue;
    }

    // Horizontal rule
    if (trimmed === "---") {
      elements.push(
        <hr key={i} className="my-2 border-slate-200 dark:border-slate-700" />
      );
      continue;
    }

    // List item: "- text" or "* text"
    if (/^[-*]\s/.test(trimmed)) {
      const listContent = trimmed.slice(2);
      elements.push(
        <div key={i} className="flex items-start gap-2 text-base leading-7 ml-1">
          <span className="text-slate-400 mt-0.5 shrink-0">•</span>
          <span className="text-slate-700 dark:text-slate-300">
            {renderInline(listContent)}
          </span>
        </div>
      );
      continue;
    }

    // Numbered list
    if (/^\d+[.)]\s/.test(trimmed)) {
      const match = trimmed.match(/^(\d+)[.)]\s(.*)/);
      if (match) {
        elements.push(
          <div key={i} className="flex items-start gap-2 text-base leading-7 ml-1">
            <span className="text-slate-400 mt-0.5 shrink-0 font-mono text-sm">{match[1]}.</span>
            <span className="text-slate-700 dark:text-slate-300">
              {renderInline(match[2])}
            </span>
          </div>
        );
        continue;
      }
    }

    // Plain text line
    elements.push(
      <div key={i} className="text-base leading-7 text-slate-700 dark:text-slate-300">
        {renderInline(trimmed)}
      </div>
    );
  }

  return <div>{elements}</div>;
}

/** Render inline markdown: **bold**, `code` */
function renderInline(text: string): React.ReactNode {
  // Parse inline elements: **bold** and `code`
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*/);
    const codeMatch = remaining.match(/^(.*?)`(.+?)`/);

    if (boldMatch && (!codeMatch || boldMatch.index! <= codeMatch.index!)) {
      if (boldMatch[1]) {
        parts.push(<span key={key++}>{boldMatch[1]}</span>);
      }
      parts.push(
        <strong key={key++} className="font-semibold text-slate-900 dark:text-slate-100">
          {boldMatch[2]}
        </strong>
      );
      remaining = remaining.slice(boldMatch[0].length);
    } else if (codeMatch) {
      if (codeMatch[1]) {
        parts.push(<span key={key++}>{codeMatch[1]}</span>);
      }
      parts.push(
        <code key={key++} className="bg-slate-200 dark:bg-slate-700 px-1 rounded text-sm font-mono">
          {codeMatch[2]}
        </code>
      );
      remaining = remaining.slice(codeMatch[0].length);
    } else {
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }
  }

  return <>{parts}</>;
}
