import ReactMarkdown from 'react-markdown';

const mdComponents = {
  p: (props) => <p className="md-p" {...props} />,
  ul: (props) => <ul className="md-ul" {...props} />,
  ol: (props) => <ol className="md-ol" {...props} />,
  li: (props) => <li className="md-li" {...props} />,
  strong: (props) => <strong className="md-strong" {...props} />,
  em: (props) => <em className="md-em" {...props} />,
  a: (props) => <a className="md-a" target="_blank" rel="noopener noreferrer" {...props} />,
  pre: (props) => <pre className="md-pre" {...props} />,
  code: ({ inline, className, children, ...props }) => {
    if (inline) {
      return (
        <code className="md-code" {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className={className || 'md-code-block'} {...props}>
        {children}
      </code>
    );
  },
  h1: (props) => <p className="md-heading md-h1" {...props} />,
  h2: (props) => <p className="md-heading md-h2" {...props} />,
  h3: (props) => <p className="md-heading md-h3" {...props} />,
  blockquote: (props) => <blockquote className="md-quote" {...props} />,
  hr: () => null,
};

export default function MarkdownBubble({ children }) {
  return (
    <div className="md-root">
      <ReactMarkdown components={mdComponents}>{children}</ReactMarkdown>
    </div>
  );
}
