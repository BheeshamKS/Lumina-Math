import React from 'react'
import { useCalculator } from '../../hooks/useCalculator'
import { ArrowUpRight, ArrowDownLeft, Delete, Loader2 } from 'lucide-react'

const BUTTONS = [
  // row 1 — functions
  [
    { label: 'sin', value: 'sin(' },
    { label: 'cos', value: 'cos(' },
    { label: 'tan', value: 'tan(' },
    { label: 'log', value: 'log(' },
  ],
  [
    { label: '√', value: 'sqrt(' },
    { label: 'x²', value: '^2' },
    { label: 'xⁿ', value: '^' },
    { label: '|x|', value: 'Abs(' },
  ],
  [
    { label: 'π', value: 'π' },
    { label: 'e', value: 'E' },
    { label: '(', value: '(' },
    { label: ')', value: ')' },
  ],
  // row 4-7 — numeric + ops
  [
    { label: '7', value: '7' },
    { label: '8', value: '8' },
    { label: '9', value: '9' },
    { label: '÷', value: '/', op: true },
  ],
  [
    { label: '4', value: '4' },
    { label: '5', value: '5' },
    { label: '6', value: '6' },
    { label: '×', value: '*', op: true },
  ],
  [
    { label: '1', value: '1' },
    { label: '2', value: '2' },
    { label: '3', value: '3' },
    { label: '−', value: '-', op: true },
  ],
  [
    { label: '0', value: '0' },
    { label: '.', value: '.' },
    { label: 'x', value: 'x' },
    { label: '+', value: '+', op: true },
  ],
]

export function Calculator({ onPushToChat, onPullFromChat, lastExpression }) {
  const calc = useCalculator(onPushToChat)

  // expose pull-from-chat handler
  React.useEffect(() => {
    if (lastExpression) {
      calc.pullFromChat(lastExpression)
    }
  }, [lastExpression])

  return (
    <div className="calculator">
      <div className="calc-header">
        <span className="calc-title">Calculator</span>
        <div className="calc-synergy">
          <button
            className="sync-btn"
            title="Push result to chat"
            onClick={calc.pushToChat}
            disabled={calc.display === '0' || calc.display === 'Error'}
          >
            <ArrowUpRight size={14} />
            <span>To Chat</span>
          </button>
        </div>
      </div>

      {/* Display */}
      <div className="calc-display">
        <div className="calc-expr">{calc.expression || '0'}</div>
        <div className={`calc-result ${calc.error ? 'has-error' : ''}`}>
          {calc.loading ? <Loader2 size={20} className="spin" /> : calc.display}
        </div>
      </div>

      {/* Controls row */}
      <div className="calc-controls">
        <button className="calc-btn ctrl clear" onClick={calc.clear}>AC</button>
        <button className="calc-btn ctrl" onClick={calc.backspace}>
          <Delete size={15} />
        </button>
        <button className="calc-btn ctrl" onClick={() => calc.append('%')}>%</button>
        <button className="calc-btn equals" onClick={calc.evaluate}>=</button>
      </div>

      {/* Function + digit grid */}
      <div className="calc-grid">
        {BUTTONS.map((row, ri) => (
          <div key={ri} className="calc-row">
            {row.map((btn) => (
              <button
                key={btn.label}
                className={`calc-btn ${btn.op ? 'op' : ''} ${btn.value === 'x' ? 'var-btn' : ''}`}
                onClick={() => calc.append(btn.value)}
              >
                {btn.label}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* History */}
      {calc.history.length > 0 && (
        <div className="calc-history">
          <p className="history-label">History</p>
          {calc.history.slice(0, 5).map((h, i) => (
            <div key={i} className="history-item" onClick={() => calc.pullFromChat(h.result)}>
              <span className="hist-expr">{h.expression}</span>
              <span className="hist-eq">=</span>
              <span className="hist-res">{h.result}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
