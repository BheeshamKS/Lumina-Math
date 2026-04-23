/**
 * BookPlugin — IndexedDB-backed textbook indexer using pdfjs-dist.
 *
 * Privacy: PDF bytes and extracted text never leave the browser except for
 * the index chunks sent to /api/chat as book_context.
 */

import * as pdfjsLib from 'pdfjs-dist'
import type { IndexedBook, BookChunk } from '../types'

// Point pdfjs worker at the bundled worker file.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

const DB_NAME  = 'lumina-books'
const DB_VER   = 1
const STORE    = 'books'

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

function idbGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror   = () => reject(req.error)
  })
}

function idbPut(db: IDBDatabase, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readwrite')
    const req = tx.objectStore(STORE).put(value)
    req.onsuccess = () => resolve()
    req.onerror   = () => reject(req.error)
  })
}

function idbDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readwrite')
    const req = tx.objectStore(STORE).delete(key)
    req.onsuccess = () => resolve()
    req.onerror   = () => reject(req.error)
  })
}

function idbGetAll<T>(db: IDBDatabase): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror   = () => reject(req.error)
  })
}

// ── PDF extraction ────────────────────────────────────────────────────────────

async function extractText(file: File): Promise<string> {
  const buffer    = await file.arrayBuffer()
  const pdfDoc    = await pdfjsLib.getDocument({ data: buffer }).promise
  const pageTexts: string[] = []

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page    = await pdfDoc.getPage(i)
    const content = await page.getTextContent()
    const pageStr = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    pageTexts.push(pageStr)
  }

  return pageTexts.join('\n\n')
}

// ── Indexing heuristics ───────────────────────────────────────────────────────

// Matches exercise section headers: "Exercise 5.1", "EXERCISE SET 5.1", "Ex. 3.2"
const EXERCISE_HEADER_RE = /\b(?:exercise(?:\s+set)?|ex\.?)\s*(\d+(?:\.\d+)*)/i
// Matches a numbered problem at the START of a line: "7.", "7)", "(7)"
// Must be at beginning of the trimmed line to avoid matching numbers inside text
const QUESTION_START_RE = /^(\d{1,3})[.)]\s/
// Matches LaTeX fragments
const LATEX_RE = /\$[^$]+\$|\$\$[\s\S]+?\$\$|\\[a-zA-Z]+(?:\{[^}]*\})+/g

function buildIndex(fullText: string): BookChunk[] {
  const chunks: BookChunk[] = []
  const lines = fullText.split('\n')
  let chapterNum = 0
  let exerciseId: string | undefined
  // Question numbers are STICKY — they persist until the next question number appears.
  // This ensures multi-line problems (question on one line, matrix on the next) stay together.
  let questionNum: number | undefined
  let latexBuf: string[] = []
  let pageNum = 1

  const flush = () => {
    if (latexBuf.length > 0) {
      chunks.push({
        chapter: chapterNum || undefined,
        exercise: exerciseId,
        question_number: questionNum,
        latex_content: latexBuf.join(' '),
        page: pageNum,
      })
      latexBuf = []
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()

    // Page boundary — flush the current chunk but keep exercise/question context
    if (trimmed === '') {
      flush()
      pageNum++
      continue
    }

    // Exercise section header (e.g., "EXERCISE SET 5.1")
    const exMatch = EXERCISE_HEADER_RE.exec(trimmed)
    if (exMatch) {
      flush()
      exerciseId = exMatch[1]
      chapterNum = parseInt(exerciseId.split('.')[0], 10) || chapterNum
      // Reset question number when entering a new exercise section
      questionNum = undefined
      continue
    }

    // Numbered problem at start of line (e.g., "7. Find the eigenvalues...")
    // Only recognised when we're already inside an exercise section
    if (exerciseId) {
      const qMatch = QUESTION_START_RE.exec(trimmed)
      if (qMatch) {
        flush()
        questionNum = parseInt(qMatch[1], 10)
        // Include the rest of this line (the problem statement) in the new chunk
        const rest = trimmed.slice(qMatch[0].length).trim()
        if (rest.length > 0) latexBuf.push(rest)
        continue
      }
    }

    // Accumulate content lines — include LaTeX fragments and any substantive text
    const latexMatches = trimmed.match(LATEX_RE)
    if (latexMatches) {
      latexBuf.push(...latexMatches)
    } else if (trimmed.length > 4) {
      latexBuf.push(trimmed)
    }
  }

  flush()
  return chunks
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function listBooks(): Promise<IndexedBook[]> {
  const db = await openDB()
  return idbGetAll<IndexedBook>(db)
}

export async function getBook(id: string): Promise<IndexedBook | undefined> {
  const db = await openDB()
  return idbGet<IndexedBook>(db, id)
}

export async function deleteBook(id: string): Promise<void> {
  const db = await openDB()
  return idbDelete(db, id)
}

export async function indexBook(
  file: File,
  title: string,
  author: string,
): Promise<IndexedBook> {
  const text  = await extractText(file)
  const index = buildIndex(text)

  const book: IndexedBook = {
    id:         `book_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    title,
    author,
    uploadedAt: Date.now(),
    index,
  }

  const db = await openDB()
  await idbPut(db, book)
  return book
}

export interface BookSearchResult {
  chunks: BookChunk[]
  /** Set when the query had an exercise/question reference but nothing matched in the index. */
  notFound?: string
}

/**
 * Search the book's index using ONLY structural fields (exercise + question_number).
 * Never falls back to fuzzy/semantic matching.
 */
export function searchBook(book: IndexedBook, query: string): BookSearchResult {
  const q = query.toLowerCase()

  // Exercise reference: "ex 5.1", "exercise 3.2", "5.1"
  const exMatch = /\b(?:ex(?:ercise)?(?:\s+set)?\s*\.?\s*)?(\d+\.\d+)/i.exec(q)
  const exerciseRef = exMatch ? exMatch[1] : null

  // Question number: "q7", "q 7", "question 7", "no 7", "#7"
  const qNumMatch = /\b(?:q(?:uestion)?\s*\.?\s*|no\.?\s*|#)(\d{1,3})\b/i.exec(q)
  const questionRef = qNumMatch ? parseInt(qNumMatch[1], 10) : null

  // No reference at all — return a few recent chunks, no error
  if (!exerciseRef && !questionRef) {
    return { chunks: book.index.slice(-5) }
  }

  // Exact structural match: both exercise AND question_number (if both specified)
  const exact = book.index.filter((chunk) => {
    const exOk = exerciseRef ? chunk.exercise === exerciseRef : true
    const qOk  = questionRef ? chunk.question_number === questionRef : true
    return exOk && qOk
  })

  if (exact.length > 0) {
    return { chunks: exact.slice(0, 8) }
  }

  // Nothing matched — tell the user rather than silently sending wrong context
  const ref = [
    exerciseRef ? `Exercise ${exerciseRef}` : '',
    questionRef ? `Question ${questionRef}` : '',
  ].filter(Boolean).join(', ')

  return {
    chunks: [],
    notFound: `${ref} was not found in the index. The book may need to be re-indexed.`,
  }
}
