import React, { useRef, useEffect, useState } from 'react'
import { BlockMath } from 'react-katex'
import { MessageRenderer, StepRenderer } from '../MathRenderer/MathRenderer'
import { ChevronDown, AlertCircle } from 'lucide-react'
import { ChatInput } from './ChatInput'
import type { Message, SolutionData, BookContext } from '../../types'

type AccordionVariant = 'default' | 'explanation' | 'tips'

function Accordion({
  label, icon, children, defaultOpen = false, variant = 'default',
}: {
  label: string
  icon?: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  variant?: AccordionVariant
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`accordion accordion--${variant}`}>
      <button className="accordion-trigger" onClick={() => setOpen((v) => !v)}>
        {icon && <span className="accordion-icon">{icon}</span>}
        <span className="accordion-label">{label}</span>
        <ChevronDown size={15} className={`accordion-chevron ${open ? 'open' : ''}`} />
      </button>
      {open && <div className="accordion-body">{children}</div>}
    </div>
  )
}

function SolvingState() {
  return (
    <div className="ws-solving">
      <div className="ws-solving-dots">
        <span /><span /><span />
      </div>
      <span className="ws-solving-label">Working…</span>
    </div>
  )
}

function ErrorCard({ content }: { content: string }) {
  return (
    <div className="ws-error">
      <AlertCircle size={16} />
      <span>{content}</span>
    </div>
  )
}

function SolutionDocument({ data }: { data: SolutionData }) {
  const steps = data.steps || []

  return (
    <div className="solution-doc">
      {data.explanation && (
        <Accordion label="Explanation & Approach" icon="◈" variant="explanation">
          <div className="sdoc-explanation">
            <MessageRenderer>{data.explanation}</MessageRenderer>
          </div>
        </Accordion>
      )}

      {steps.length > 0 && (
        <div className="sdoc-steps-section">
          <div className="sdoc-steps-label">Working</div>
          <div className="sdoc-steps">
            {steps.map((step, i) => (
              <StepRenderer key={i} step={step} index={i} />
            ))}
          </div>
        </div>
      )}

      {data.final_answer && (
        <div className="sdoc-answer">
          <div className="sdoc-answer-rule" />
          <div className="sdoc-answer-inner">
            <span className="sdoc-answer-label">Answer</span>
            <div className="sdoc-answer-math">
              <BlockMath
                math={data.final_answer}
                renderError={(_err: Error) => <code className="math-fallback">{data.final_answer}</code>}
              />
            </div>
            <span className="sdoc-answer-qed">∎</span>
          </div>
          <div className="sdoc-answer-rule" />
        </div>
      )}

      {data.tips && (
        <Accordion label="Common Mistakes" icon="⚠" variant="tips">
          <div className="sdoc-tips-body">
            <MessageRenderer>{data.tips}</MessageRenderer>
          </div>
        </Accordion>
      )}
    </div>
  )
}

function ProblemHeader({ content }: { content: string }) {
  return (
    <div className="ws-problem">
      <span className="ws-problem-badge">Problem</span>
      <div className="ws-problem-text">
        <MessageRenderer>{content}</MessageRenderer>
      </div>
    </div>
  )
}

const EXAMPLES = [
  '2x + 4 = 8',
  'x^2 - 5x + 6 = 0',
  'd/dx(x^3 + 2x^2 - 7)',
  'integrate x^2 dx',
  'factor x^3 - 6x^2 + 11x - 6',
  'limit of sin(x)/x as x -> 0',
  'simplify (x^2 - 4)/(x - 2)',
]

function WelcomeScreen({ onPrompt }: { onPrompt: (text: string) => void }) {
  return (
    <div className="ws-welcome">
      <div className="ws-welcome-logo">
        <div className="ws-welcome-ring" />
        <span className="ws-welcome-letter">L</span>
      </div>
      <h1 className="ws-welcome-title">Lumina <span>Math</span></h1>
      <p className="ws-welcome-sub">
        Enter an equation or expression below and get a step-by-step solution.
      </p>
      <div className="ws-example-grid">
        {EXAMPLES.map((e) => (
          <button key={e} className="ws-example-chip" onClick={() => onPrompt(e)}>
            {e}
          </button>
        ))}
      </div>
    </div>
  )
}

interface ChatInterfaceProps {
  messages: Message[]
  loading: boolean
  onSendMessage: (text: string, bookContext?: BookContext) => void
  onClearChat: () => void
  pushValue: string
  onClearPush: () => void
}

export function ChatInterface({
  messages, loading, onSendMessage, onClearChat, pushValue, onClearPush,
}: ChatInterfaceProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const isEmpty = messages.length === 0

  return (
    <div className="worksheet-shell">
      <div className="worksheet-area">
        {isEmpty ? (
          <WelcomeScreen onPrompt={onSendMessage} />
        ) : (
          <>
            {messages.map((msg) => {
              if (msg.role === 'user') {
                return <ProblemHeader key={msg.id} content={msg.content} />
              }
              if (msg.type === 'loading') return <SolvingState key={msg.id} />
              if (msg.type === 'solution') return <SolutionDocument key={msg.id} data={msg.data ?? {}} />
              if (msg.type === 'error') return <ErrorCard key={msg.id} content={msg.content} />
              return (
                <div key={msg.id} className="ws-text-response">
                  <MessageRenderer>{msg.content}</MessageRenderer>
                </div>
              )
            })}
            <div ref={bottomRef} style={{ height: 1 }} />
          </>
        )}
      </div>

      <ChatInput
        onSend={onSendMessage}
        loading={loading}
        onClear={onClearChat}
        messages={messages}
        pushValue={pushValue}
        onClearPush={onClearPush}
      />
    </div>
  )
}
