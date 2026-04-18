import React, { type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { BlockMath } from 'react-katex'
import type { Step } from '../../types'

export function MessageRenderer({ children, className = '' }: { children?: ReactNode; className?: string }) {
  if (children == null) return null
  const text = String(children)

  return (
    <div className={`message-renderer ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code({ className: cls, children: code, ...props }) {
            if (cls) {
              return (
                <pre className="code-block">
                  <code className={cls} {...props}>{code}</code>
                </pre>
              )
            }
            return <code className="inline-code" {...props}>{code}</code>
          },
          pre({ children: c }) {
            // strip default <pre> wrapper — our code component adds its own
            return <>{c}</>
          },
          p({ children: c }) {
            return <span className="md-p">{c}</span>
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

export function MathRenderer({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <MessageRenderer className={className}>{children}</MessageRenderer>
}

export function StepRenderer({ step, index }: { step: Step; index: number }) {
  const expr = step.expression_rhs
    ? `${step.expression} = ${step.expression_rhs}`
    : step.expression

  return (
    <div className="step-item">
      <div className="step-number">{index + 1}</div>
      <div className="step-body">
        {(step.description || step.title) && (
          <p className="step-description">
            <MessageRenderer>{step.description || step.title}</MessageRenderer>
          </p>
        )}
        {step.explanation && (
          <p className="step-explanation">
            <MessageRenderer>{step.explanation}</MessageRenderer>
          </p>
        )}
        {expr && (
          <div className="step-expression">
            <BlockMath
              math={expr}
              renderError={(_err: Error) => <code className="math-fallback">{expr}</code>}
            />
          </div>
        )}
      </div>
    </div>
  )
}
