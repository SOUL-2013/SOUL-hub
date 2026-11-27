import { useMemo } from 'react';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import css from 'highlight.js/lib/languages/css';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import 'highlight.js/styles/github-dark.css';
import { getHighlightLanguage } from '../lib/validation';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('c', c);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('css', css);
hljs.registerLanguage('go', go);
hljs.registerLanguage('java', java);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('kotlin', kotlin);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('php', php);
hljs.registerLanguage('python', python);
hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('swift', swift);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('yaml', yaml);

export function CodeHighlighter({
  code,
  filename,
  highlightedLine,
  onSelectLine,
}: {
  code: string;
  filename: string;
  highlightedLine?: number | null;
  onSelectLine?: (line: number) => void;
}) {
  const lines = useMemo(() => code.split('\n'), [code]);
  const lang = getHighlightLanguage(filename);

  const highlightedLines = useMemo(() => {
    if (lines.length > 2500) {
      return lines;
    }
    return lines.map((line) => {
      if (lang === 'plaintext') return null;
      try {
        return hljs.highlight(line, { language: lang, ignoreIllegals: true }).value;
      } catch {
        return null;
      }
    });
  }, [lines, lang]);

  return (
    <div className="overflow-x-auto bg-slate-50 dark:bg-[#090D16] text-xs font-mono leading-5">
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((rawLine, idx) => {
            const lineNum = idx + 1;
            const isSelected = highlightedLine === lineNum;
            const html = highlightedLines[idx];
            return (
              <tr
                key={lineNum}
                className={isSelected ? 'bg-blue-500/15' : 'hover:bg-slate-200/40 dark:hover:bg-slate-800/30'}
              >
                <td className="select-none w-12 text-right pr-3 pl-3 py-0.5 text-slate-400 dark:text-slate-600 border-r border-slate-200 dark:border-slate-800/80 align-top">
                  <button
                    type="button"
                    onClick={() => onSelectLine?.(lineNum)}
                    className="hover:text-blue-500 focus:outline-none tabular-nums"
                    aria-label={`Line ${lineNum}`}
                  >
                    {lineNum}
                  </button>
                </td>
                <td className="pl-4 pr-4 py-0.5 whitespace-pre text-slate-800 dark:text-slate-200">
                  {typeof html === 'string' && lang !== 'plaintext' ? (
                    <span dangerouslySetInnerHTML={{ __html: html || ' ' }} />
                  ) : (
                    <span>{rawLine || ' '}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
