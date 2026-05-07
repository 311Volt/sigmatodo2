import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { attachments as attachmentsApi } from '@/lib/api';
import { cn } from '@/lib/utils';

interface MarkdownViewerProps {
  content: string;
  className?: string;
}

export default function MarkdownViewer({ content, className }: MarkdownViewerProps) {
  return (
    <div
      className={cn(
        'prose prose-sm dark:prose-invert max-w-none',
        'prose-p:my-1 prose-pre:bg-muted prose-code:bg-muted prose-code:px-1 prose-code:rounded',
        'prose-img:rounded-md prose-img:max-w-full',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          a: ({ node: _node, href, ...props }) => (
            <a href={href ? attachmentsApi.withAuthToken(href) : href} {...props} />
          ),
          img: ({ node: _node, src, alt, ...props }) => (
            <img src={src ? attachmentsApi.withAuthToken(src) : src} alt={alt ?? ''} {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
