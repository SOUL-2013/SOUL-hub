import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

export function MarkdownView({ content, className = '' }: { content: string; className?: string }) {
  return (
    <div
      className={`prose prose-slate dark:prose-invert max-w-none text-sm leading-relaxed
        [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h1]:mt-0 [&_h1]:mb-4 [&_h1]:pb-2 [&_h1]:border-b [&_h1]:border-slate-200 dark:[&_h1]:border-slate-800
        [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-3
        [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-5 [&_h3]:mb-2
        [&_p]:my-3 [&_p]:text-slate-700 dark:[&_p]:text-slate-300
        [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-3
        [&_li]:my-1 [&_li]:text-slate-700 dark:[&_li]:text-slate-300
        [&_a]:text-blue-600 dark:[&_a]:text-blue-400 [&_a]:underline [&_a]:underline-offset-2
        [&_code]:font-mono [&_code]:text-xs [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-slate-100 dark:[&_code]:bg-slate-800/80
        [&_pre]:my-4 [&_pre]:p-4 [&_pre]:rounded-xl [&_pre]:overflow-x-auto [&_pre]:border [&_pre]:border-slate-200 dark:[&_pre]:border-slate-800 [&_pre]:bg-slate-50 dark:[&_pre]:bg-[#090D16]
        [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-xs
        [&_table]:w-full [&_table]:border-collapse [&_table]:my-4
        [&_th]:text-left [&_th]:p-2.5 [&_th]:border [&_th]:border-slate-200 dark:[&_th]:border-slate-800 [&_th]:bg-slate-50 dark:[&_th]:bg-slate-900/60
        [&_td]:p-2.5 [&_td]:border [&_td]:border-slate-200 dark:[&_td]:border-slate-800
        [&_blockquote]:my-4 [&_blockquote]:pl-4 [&_blockquote]:text-slate-600 dark:[&_blockquote]:text-slate-400 [&_blockquote]:italic ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ href, children, ...props }) => {
            const safeHref = href && /^(https?:|\/|#)/i.test(href) ? href : '#';
            return (
              <a href={safeHref} target={safeHref.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" {...props}>
                {children}
              </a>
            );
          },
        }}
      >
        {content || ''}
      </ReactMarkdown>
    </div>
  );
}
