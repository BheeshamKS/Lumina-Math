import React, { useRef, useEffect, useState } from 'react'
import { BlockMath } from 'react-katex'
import { MessageRenderer, StepRenderer } from '../MathRenderer/MathRenderer'
import { ChevronDown, AlertCircle, Lightbulb, MessageSquare } from 'lucide-react'
import { ChatInput } from './ChatInput'

/* ═══════════════════════════════════════════════════════════════════
   Worksheet primitives
   ═══════════════════════════════════════════════════════════════════ */

function Accordion({ label, icon, children, defaultOpen = false, variant = 'default' }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`accordion accordion--${variant}`}>
      <button className="accordion-trigger" onClick={() => setOpen(v => !v)}>
        {icon && <span className="accordion-icon">{icon}</span>}
        <span className="accordion-label">{label}</span>
        <ChevronDown size={15} className={`accordion-chevron ${open ? 'open' : ''}`} />
      </button>
      {open && (
        <div className="accordion-body">
          {children}
        </div>
      )}
    </div>
  )
}

/* ── Loading skeleton ──────────────────────────────────────────── */
function SolvingState({ label }) {
  return (
    <div className="ws-solving">
      <div className="ws-solving-dots">
        <span /><span /><span />
      </div>
      <span className="ws-solving-label">{label || 'Working…'}</span>
    </div>
  )
}

/* ── Error card ─────────────────────────────────────────────────── */
function ErrorCard({ content }) {
  return (
    <div className="ws-error">
      <AlertCircle size={16} />
      <span>{content}</span>
    </div>
  )
}

/* ── Clarification card ─────────────────────────────────────────── */
function ClarificationCard({ data, onSelect }) {
  return (
    <div className="ws-clarification">
      <p className="ws-clarification-q">{data.question}</p>
      <div className="ws-clarification-opts">
        {(data.options || []).map((opt, i) => (
          <button key={i} className="ws-clarification-btn" onClick={() => onSelect(opt)}>
            <span className="ws-opt-badge">{String.fromCharCode(65 + i)}</span>
            <code>{opt}</code>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── Follow-up response ─────────────────────────────────────────── */
function FollowupCard({ content }) {
  return (
    <div className="ws-followup">
      <MessageSquare size={14} className="ws-followup-icon" />
      <div className="ws-followup-body">
        <MessageRenderer>{content}</MessageRenderer>
      </div>
    </div>
  )
}

/* ── Full solution document ─────────────────────────────────────── */
function SolutionDocument({ data }) {
  const steps = data.steps || data.sympy?.steps || []

  return (
    <div className="solution-doc">
      {/* Explanation — hidden by default */}
      {data.explanation && (
        <Accordion label="Explanation & Approach" icon="◈" variant="explanation">
          <div className="sdoc-explanation">
            <MessageRenderer>{data.explanation}</MessageRenderer>
          </div>
        </Accordion>
      )}

      {/* Steps */}
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

      {/* Final answer — large, prominent */}
      {data.final_answer && (
        <div className="sdoc-answer">
          <div className="sdoc-answer-rule" />
          <div className="sdoc-answer-inner">
            <span className="sdoc-answer-label">Answer</span>
            <div className="sdoc-answer-math">
              <BlockMath
                math={data.final_answer}
                renderError={() => <code className="math-fallback">{data.final_answer}</code>}
              />
            </div>
            <span className="sdoc-answer-qed">∎</span>
          </div>
          <div className="sdoc-answer-rule" />
        </div>
      )}

      {/* Tips — hidden by default */}
      {data.tips && (
        <Accordion label="Common Mistakes" icon={<Lightbulb size={13} />} variant="tips">
          <div className="sdoc-tips-body">
            <MessageRenderer>{data.tips}</MessageRenderer>
          </div>
        </Accordion>
      )}
    </div>
  )
}

/* ── Problem header (user's input) ─────────────────────────────── */
function ProblemHeader({ content, type, filename, src }) {
  return (
    <div className="ws-problem">
      <span className="ws-problem-badge">Problem</span>
      {type === 'image' ? (
        <div className="ws-problem-image">
          <img src={src || content} alt={filename || 'uploaded math'} />
          {filename && <span className="ws-problem-filename">{filename}</span>}
        </div>
      ) : (
        <div className="ws-problem-text">
          <MessageRenderer>{content}</MessageRenderer>
        </div>
      )}
    </div>
  )
}

/* ── Welcome screen ─────────────────────────────────────────────── */
const EXAMPLES = [
  'x² - 5x + 6 = 0',
  'd/dx(x³ + 2x² − 7)',
  '∫ x² dx',
  'factor x³ − 6x² + 11x − 6',
  'limit of sin(x)/x as x → 0',
  'simplify (x² − 4)/(x − 2)',
]

function WelcomeScreen({ onPrompt }) {
  return (
    <div className="ws-welcome">
      <div className="ws-welcome-logo">
        <div className="ws-welcome-ring" />
        <span className="ws-welcome-letter">L</span>
      </div>
      <h1 className="ws-welcome-title">Lumina <span>Math</span></h1>
      <p className="ws-welcome-sub">
        Enter an equation, expression, or problem below — or upload an image of handwritten math.
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

/* ═══════════════════════════════════════════════════════════════════
   Main ChatInterface — now a "Worksheet View"
   ═══════════════════════════════════════════════════════════════════ */
export function ChatInterface({
  messages, loading, onSendMessage, onSendFollowup, onImageUpload,
  onSelectClarification, onClearChat, lastSolution, pushFromCalc, onClearCalcPush,
}) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const isEmpty = messages.length === 0

  return (
    <div className="worksheet-shell">
      {/* ── Worksheet area ── */}
      <div className="worksheet-area">
        {isEmpty ? (
          <WelcomeScreen onPrompt={onSendMessage} />
        ) : (
          <>
            {messages.map((msg) => {
              if (msg.role === 'user') {
                return (
                  <ProblemHeader
                    key={msg.id}
                    content={msg.content}
                    type={msg.type}
                    filename={msg.filename}
                    src={msg.content}
                  />
                )
              }
              // Assistant messages
              if (msg.type === 'loading') return <SolvingState key={msg.id} label={msg.content} />
              if (msg.type === 'solution') return <SolutionDocument key={msg.id} data={msg.data || {}} />
              if (msg.type === 'clarification') return (
                <ClarificationCard
                  key={msg.id}
                  data={msg.data || { question: msg.content, options: [] }}
                  onSelect={onSelectClarification}
                />
              )
              if (msg.type === 'followup') return <FollowupCard key={msg.id} content={msg.content} />
              if (msg.type === 'error') return <ErrorCard key={msg.id} content={msg.content} />
              // Generic text (image extraction in-progress note, etc.)
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

      {/* ── Chat input with keyboard ── */}
      <ChatInput
        onSend={onSendMessage}
        onFollowup={onSendFollowup}
        onImageUpload={onImageUpload}
        loading={loading}
        lastSolution={lastSolution}
        pushFromCalc={pushFromCalc}
        onClearCalcPush={onClearCalcPush}
        onClear={onClearChat}
        messages={messages}
      />
    </div>
  )
}
