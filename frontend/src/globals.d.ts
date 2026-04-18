import 'react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'math-field': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        placeholder?: string
        'aria-label'?: string
      }
    }
  }
}

declare global {
  interface Window {
    mathVirtualKeyboard:
      | {
          visible: boolean
          show(): void
          hide(): void
          container: Element | null
          layouts: unknown[]
        }
      | undefined
  }
}
