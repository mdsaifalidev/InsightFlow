// File parsing for uploads (PRD F2). Produces untyped rows; profile.ts infers
// types and coerces values afterwards.

import Papa from "papaparse"

import type { ParsedColumn, ParsedTable, Row } from "../types"

export class ParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ParseError"
  }
}

const fmt = new Intl.NumberFormat("en-US")

/** snake_case, ASCII-safe, unique column names; keeps the original header. */
export function normalizeColumnNames(headers: string[]): ParsedColumn[] {
  const seen = new Map<string, number>()
  return headers.map((header, i) => {
    const originalName = String(header ?? "").trim()
    let name = originalName
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
    if (!name) name = `column_${i + 1}`
    if (/^\d/.test(name)) name = `c_${name}`
    const n = (seen.get(name) ?? 0) + 1
    seen.set(name, n)
    return {
      name: n > 1 ? `${name}_${n}` : name,
      originalName: originalName || name,
    }
  })
}

function toTable(grid: unknown[][]): ParsedTable {
  const [header, ...body] = grid
  if (!header || header.every((h) => h === null || String(h).trim() === "")) {
    throw new ParseError(
      "The file has no header row. The first row must contain column names."
    )
  }
  if (!body.length) {
    throw new ParseError("The file has a header row but no data rows.")
  }
  const columns = normalizeColumnNames(header.map((h) => String(h ?? "")))
  const rows: Row[] = body.map((cells, i) => {
    if (cells.length !== columns.length) {
      throw new ParseError(
        `Row ${fmt.format(i + 2)} has ${cells.length} columns, expected ${columns.length}.`
      )
    }
    const row: Row = {}
    columns.forEach((column, c) => {
      const cell = cells[c]
      row[column.name] =
        cell instanceof Date
          ? cell.toISOString()
          : ((cell ?? null) as Row[string])
    })
    return row
  })
  return { columns, rows }
}

export function parseCsv(text: string): ParsedTable {
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
    skipEmptyLines: "greedy",
  })
  const fatal = result.errors.find((e) => e.type === "Quotes")
  if (fatal) {
    throw new ParseError(
      `Row ${fmt.format((fatal.row ?? 0) + 1)} has an unclosed quote. Check the file's quoting.`
    )
  }
  return toTable(result.data)
}

export async function parseXlsx(file: Blob): Promise<ParsedTable> {
  const { readSheet } = await import("read-excel-file/browser")
  try {
    const data = await readSheet(file)
    return toTable(data as unknown[][])
  } catch (error) {
    if (error instanceof ParseError) throw error
    throw new ParseError(
      "This Excel file couldn't be read. Save it as .xlsx and try again."
    )
  }
}

export async function parseFile(file: Blob, fileType: "csv" | "xlsx") {
  return fileType === "csv" ? parseCsv(await file.text()) : parseXlsx(file)
}
