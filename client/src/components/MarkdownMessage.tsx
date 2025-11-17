import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface MarkdownMessageProps {
  content: string;
}

interface CodeProps {
  node?: any;
  className?: string;
  children?: React.ReactNode;
  [key: string]: any;
}

const CodeComponent: React.FC<CodeProps> = ({ className, children, ...props }) => {
  const match = /language-(\w+)/.exec(className || '');
  const inline = !className;
  
  let childrenString = '';
  if (Array.isArray(children)) {
    childrenString = children.join('');
  } else if (typeof children === 'string') {
    childrenString = children;
  } else if (typeof children === 'number' || typeof children === 'boolean') {
    childrenString = String(children);
  }
  
  return !inline && match ? (
    <SyntaxHighlighter
      style={vscDarkPlus}
      language={match[1]}
      PreTag="div"
      {...props}
    >
      {childrenString.replace(/\n$/, '')}
    </SyntaxHighlighter>
  ) : (
    <code className={className} {...props}>
      {children}
    </code>
  );
};

const MarkdownMessage: React.FC<MarkdownMessageProps> = ({ content }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code: CodeComponent,
      }}
    >
      {content}
    </ReactMarkdown>
  );
};

export default MarkdownMessage;
