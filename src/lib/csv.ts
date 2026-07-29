import fs from "node:fs";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

export type CsvRecord = Record<string, string>;

export function readCsv(filePath: string): CsvRecord[] {
  const content = fs.readFileSync(filePath, "utf-8");
  return parse(content, { columns: true, skip_empty_lines: true, trim: false }) as CsvRecord[];
}

export function writeCsv(filePath: string, records: CsvRecord[]): void {
  const columns = records.length > 0 ? Object.keys(records[0]) : [];
  const output = stringify(records, { header: true, columns });
  fs.writeFileSync(filePath, output);
}
