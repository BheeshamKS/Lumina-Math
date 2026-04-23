export interface User {
  user_id: string
  email: string
}

export interface TokenData {
  access_token: string
  refresh_token: string
  user_id: string
  email: string
}

export interface Step {
  description?: string
  title?: string
  explanation?: string
  expression?: string
  expression_rhs?: string
}

export interface SolutionData {
  type?: string
  steps?: Step[]
  final_answer?: string
  explanation?: string
  tips?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  type: 'text' | 'solution' | 'error' | 'loading'
  content: string
  data?: SolutionData
  timestamp: number
}

export interface Session {
  id: string
  title?: string
  created_at?: string
}

export interface FormulaItem {
  name: string
  latex: string
  insert: string
}

export interface FormulaCategory {
  id: string
  label: string
  icon: string
  items: FormulaItem[]
}

export interface SaveSolutionData {
  latex_input: string
  steps: string[]
  final_answer: string
}

// ── Plugins ────────────────────────────────────────────────────────────────

export interface PluginInfo {
  name: string
  display_name: string
  description: string
  required_tools: string[]
  enabled: boolean
  always_enabled: boolean
}

// ── Book plugin ────────────────────────────────────────────────────────────

export interface BookChunk {
  chapter?: number
  exercise?: string
  question_number?: number
  latex_content: string
  page?: number
}

export interface BookContext {
  chunks: BookChunk[]
}

export interface IndexedBook {
  id: string
  title: string
  author: string
  uploadedAt: number
  index: BookChunk[]
}
