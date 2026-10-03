/** A typed row: datetimes are ISO strings, missing values are null. */
export type CellValue = string | number | boolean | null
export type Row = Record<string, CellValue>

export type ParsedColumn = { name: string; originalName: string }

export type ParsedTable = {
  columns: ParsedColumn[]
  rows: Row[]
}
