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

// Matches: "Exercise 5.1", "5.1", "Section 3", "Chapter 2"
const EXERCISE_RE = /\b(?:exercise|ex\.?|section|problem)\s*(\d+(?:\.\d+)*)/gi
// Matches: "7.", "Q7", "No. 7", "(7)"
const QUESTION_RE = /(?:^|\s)(?:q(?:uestion)?\.?\s*|no\.?\s*|\()(\d{1,3})(?:\)|\.|\s|$)/gim
// Matches LaTeX fragments
const LATEX_RE    = /\$[^$]+\$|\$\$[\s\S]+?\$\$|\\[a-zA-Z]+(?:\{[^}]*\})+/g

function buildIndex(fullText: string): BookChunk[] {
  const chunks: BookChunk[] = []
  const lines   = fullText.split('\n')
  let chapterNum = 0
  let exerciseId: string | undefined
  let questionNum: number | undefined
  let latexBuf: string[] = []
  let pageNum  = 1

  for (const line of lines) {
    // Track synthetic page boundaries (pdfjs separates pages with double newlines)
    if (line.trim() === '') {
      if (latexBuf.length > 0) {
        chunks.push({
          chapter: chapterNum || undefined,
          exercise: exerciseId,
          question_number: questionNum,
          latex_content: latexBuf.join(' '),
          page: pageNum,
        })
        latexBuf = []
        questionNum = undefined
      }
      pageNum++
      continue
    }

    // Chapter / exercise header
    const exMatch = EXERCISE_RE.exec(line)
    if (exMatch) {
      exerciseId  = exMatch[1]
      chapterNum  = parseInt(exerciseId.split('.')[0], 10) || chapterNum
      EXERCISE_RE.lastIndex = 0
    }

    // Question number
    const qMatch = QUESTION_RE.exec(line)
    if (qMatch) {
      questionNum = parseInt(qMatch[1], 10)
      QUESTION_RE.lastIndex = 0
    }

    // Accumulate LaTeX fragments
    const latexMatches = line.match(LATEX_RE)
    if (latexMatches) {
      latexBuf.push(...latexMatches)
    } else if (line.trim().length > 4) {
      // Include short non-LaTeX text that might be math (e.g. "x^2 + 2x = 0")
      latexBuf.push(line.trim())
    }
  }

  // Flush remaining buffer
  if (latexBuf.length > 0) {
    chunks.push({
      chapter: chapterNum || undefined,
      exercise: exerciseId,
      question_number: questionNum,
      latex_content: latexBuf.join(' '),
      page: pageNum,
    })
  }

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

/**
 * Search the book's index for chunks relevant to a user query.
 * Parses exercise and question references from the query text.
 */
export function searchBook(book: IndexedBook, query: string): BookChunk[] {
  const q = query.toLowerCase()

  // Try to extract exercise ref: "ex 5.1", "exercise 3.2", "5.1"
  const exMatch = /\b(?:ex(?:ercise)?\.?\s*)?(\d+\.\d+)/i.exec(q)
  const exerciseRef = exMatch ? exMatch[1] : null

  // Try to extract question number: "q7", "question 7", "no 7", "#7"
  const qMatch = /\b(?:q(?:uestion)?\.?\s*|no\.?\s*|#)(\d{1,3})\b/i.exec(q)
  const questionRef = qMatch ? parseInt(qMatch[1], 10) : null

  if (!exerciseRef && !questionRef) {
    // No specific reference — return up to 5 most-recent chunks
    return book.index.slice(-5)
  }

  return book.index.filter((chunk) => {
    const exMatch = exerciseRef ? chunk.exercise === exerciseRef : true
    const qMatch  = questionRef ? chunk.question_number === questionRef : true
    return exMatch && qMatch
  }).slice(0, 5)
}
