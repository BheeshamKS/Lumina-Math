import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { BlockMath } from 'react-katex'

/**
 * MessageRenderer
 * ───────────────
 * Canonical renderer for all LLM-produced text.
 * Handles mixed markdown + math via remark-math / rehype-katex:
 *   - $...$ → inline KaTeX
 *   - $$...$$ → display KaTeX (block)
 *   - Standard markdown (bold, italic, lists, code, headings)
 *   - Complex structures: matrices, fractions, integrals, Greek letters
 *
 * Use this for every string that originates from the LLM.
 */
export function MessageRenderer({ children, className = '' }) {
  if (children == null) return null
  const text = String(children)

  return (
    <div className={`message-renderer ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // Inline code → styled <code>
          code({ node, inline, className: cls, children: code, ...props }) {
            if (inline) {
              return (
                <code className="inline-code" {...props}>
                  {code}
                </code>
              )
            }
            return (
              <pre className="code-block">
                <code className={cls} {...props}>{code}</code>
              </pre>
            )
          },
          // span instead of p — avoids <p> inside <p> when used inside StepRenderer
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

/**
 * MathRenderer (legacy compat alias)
 * ────────────────────────────────────
 * Kept so any remaining import of <MathRenderer> still works.
 */
export function MathRenderer({ children, className = '' }) {
  return <MessageRenderer className={className}>{children}</MessageRenderer>
}

/**
 * StepRenderer
 * ─────────────
 * Renders a single SymPy solution step.
 *
 * Text fields (description, explanation) come from the LLM → MessageRenderer.
 * Expression field is raw SymPy LaTeX (no $ delimiters) → BlockMath directly.
 */
export function StepRenderer({ step, index }) {
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
              renderError={() => <code className="math-fallback">{expr}</code>}
            />
          </div>
        )}
      </div>
    </div>
  )
}
