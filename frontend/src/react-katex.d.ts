declare module 'react-katex' {
  import type { ReactNode } from 'react'
  interface KatexProps {
    math: string
    renderError?: (error: Error) => ReactNode
    settings?: object
  }
  export function BlockMath(props: KatexProps): JSX.Element
  export function InlineMath(props: KatexProps): JSX.Element
}
