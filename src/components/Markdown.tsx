/**
 * Markdown — Rich Text Renderer with LaTeX Math Support
 *
 * Renders AI-generated explanations with full support for:
 * - GitHub Flavored Markdown (tables, strikethrough, task lists) via remark-gfm
 * - Inline math ($x^2$) and display math ($$\int_0^1 x dx$$) via remark-math + rehype-katex
 * - Custom link behavior (target="_blank" for safety)
 * - Inline code with dark-mode styling
 *
 * ## Design Decision: KaTeX vs. MathJax
 *
 * KaTeX was chosen over MathJax for rendering speed. KaTeX renders synchronously
 * in ~1ms per expression, while MathJax requires async layout passes. For streaming
 * responses where math expressions appear progressively, KaTeX's speed prevents
 * visible re-layout jank.
 *
 * ## Dark Mode Prose
 *
 * Uses Tailwind's prose-invert for dark mode text colors. Custom CSS variables
 * in index.css override the default prose colors for better contrast on the
 * dark zinc background.
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

interface MarkdownProps {
  children: string;
  className?: string;
}

export function Markdown({ children, className = "" }: MarkdownProps) {
  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ href, children: linkChildren }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
            >
              {linkChildren}
            </a>
          ),
          code: ({ className: codeClass, children: codeChildren, ...props }) => {
            const isInline = !codeClass;
            if (isInline) {
              return (
                <code className="bg-white/10 px-1.5 py-0.5 rounded text-sm" {...props}>
                  {codeChildren}
                </code>
              );
            }
            return (
              <code className={`${codeClass} block overflow-x-auto`} {...props}>
                {codeChildren}
              </code>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
