// ###   ./src/services/sheet.service.ts   ###

import xlsx from "xlsx";
import path from "path";

export type FiltrarPlanilhaOptions = {
    sheet?: string;
};

export type SheetRowObject = Record<string, unknown>;

/**
 * @description Essa função ela nada mais é que um filtro, será usada para filtrar qualquer valor de uma planilha.
 * @param filePath - Caminho do arquivo `.xlsx` no disco.
 * @param coluna - Nome do cabeçalho da coluna da planilha ou letra da coluna (A, B, C...).
 * @param filtro - Expressão de filtro aplicada aos valores da coluna.
 * @param opts - Opções (ex.: nome da aba).
 * @returns Lista de objetos (linhas) que passaram no filtro.
 */
export function filtrarPlanilha(
    filePath: string,
    coluna: string,
    filtro: string,
    opts: FiltrarPlanilhaOptions = {}
): SheetRowObject[] {
    const abs = path.resolve(filePath);
    const wb = xlsx.readFile(abs, { cellDates: true });

    const sheetName = opts.sheet || wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    if (!ws) throw new Error(`Aba não encontrada: ${sheetName}`);

    const rowsArr = xlsx.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true }) as unknown[][];
    if (rowsArr.length === 0) return [];

    // 1. Normaliza os cabeçalhos da primeira linha e remove os que resultarem em vazio
    const headers = (rowsArr[0] ?? []).map((h) => normalizeHeader(h));
    const rawData = rowsArr.slice(1);

    // 2. Cria o array de objetos com as chaves já normalizadas
    const rowsObj: SheetRowObject[] = rawData.map((row) => {
        const obj: SheetRowObject = {};
        headers.forEach((header, index) => {
            if (header) obj[header] = row?.[index];
        });
        return obj;
    });

    // 3. Determina a chave a ser usada no filtro
    const isLetter = /^[A-Z]+$/.test(String(coluna).toUpperCase());
    let headerKey: string | undefined;

    if (isLetter) {
        const colIndex = colLetterToIndex(String(coluna).toUpperCase());
        headerKey = headers[colIndex];
    } else {
        headerKey = normalizeHeader(coluna);
    }

    if (!headerKey) {
        throw new Error(`Coluna "${coluna}" não encontrada ou resultou em um cabeçalho vazio.`);
    }

    const getValue = (obj: SheetRowObject) => obj[headerKey as string];
    const evaluator = buildFilterEvaluator(filtro);

    // 4. Filtra os resultados
    const result: SheetRowObject[] = [];
    for (const obj of rowsObj) {
        const val = getValue(obj);
        if (evaluator(val)) result.push(obj);
    }
    return result;
}

/* ========================= Helpers ========================= */

/** Converte "A" -> 0, "B" -> 1, ..., "AA" -> 26, etc. */
function colLetterToIndex(letter: string): number {
    let idx = 0;
    for (let i = 0; i < letter.length; i++) {
        idx = idx * 26 + (letter.charCodeAt(i) - 64); // 'A' = 65
    }
    return idx - 1;
}

/** Normaliza string numérica BR/US para Number (ou NaN) */
function toNumber(val: unknown): number {
    if (typeof val === "number") return val;
    const s = String(val ?? "").trim();
    if (!s) return NaN;
    const norm = s.replace(/\./g, "").replace(",", ".");
    return /^[+-]?\d+(\.\d+)?$/.test(norm) ? Number(norm) : NaN;
}

/** Tenta comparar numericamente; se não der, compara como string */
function compare(a: unknown, b: unknown, op: string): boolean {
    const na = toNumber(a);
    const nb = toNumber(b);

    const bothNums = !Number.isNaN(na) && !Number.isNaN(nb);
    if (bothNums) {
        if (op === "==") return na === nb;
        if (op === "!=") return na !== nb;
        if (op === ">") return na > nb;
        if (op === ">=") return na >= nb;
        if (op === "<") return na < nb;
        if (op === "<=") return na <= nb;
    } else {
        const sa = String(a ?? "");
        const sb = String(b ?? "");
        if (op === "==") return sa === sb;
        if (op === "!=") return sa !== sb;
        if (op === ">") return sa > sb;
        if (op === ">=") return sa >= sb;
        if (op === "<") return sa < sb;
        if (op === "<=") return sa <= sb;
    }
    return false;
}

/**
 * Constrói uma função (valor) => boolean com base em uma expressão como:
 *  "=10" | ">0" | ">=5 && <=100" | "=Wow" | "> 10 || = \"Wow\""
 */
function buildFilterEvaluator(exprRaw: string): (value: unknown) => boolean {
    if (!exprRaw || !exprRaw.trim()) return () => true;

    const expr = exprRaw.trim();

    // Divide por '||' (OR)
    const orParts = splitTopLevel(expr, "||");

    const andGroups = orParts.map((part) => {
        const andParts = splitTopLevel(part, "&&")
            .map((s) => s.trim())
            .filter(Boolean);
        return andParts.map(parseSimpleCondition);
    });

    return (value: unknown) => andGroups.some((group) => group.every((pred) => pred(value)));
}

/** Divide expressão por um operador lógico top-level */
function splitTopLevel(s: string, sep: string): string[] {
    return s.split(sep).map((p) => p.trim()).filter(Boolean);
}

/**
 * Converte string de condição simples em predicado.
 * Aceita: =, ==, !=, >, >=, <, <=
 */
function parseSimpleCondition(condRaw: string): (v: unknown) => boolean {
    const cond = condRaw.trim();

    // Normaliza "=" para "=="
    const norm = cond.replace(/^\s*=\s*/, "== ");

    const m = norm.match(/^(==|!=|>=|<=|>|<)\s*(.+)$/);
    if (!m) {
        const valOnly = stripQuotes(norm);
        return (v: unknown) => compare(v, valOnly, "==");
    }

    const op = m[1];
    const rhsRaw = m[2].trim();
    const rhs = stripQuotes(rhsRaw);

    return (v: unknown) => compare(v, rhs, op);
}

/** Remove aspas simples ou duplas das bordas, se existirem */
function stripQuotes(s: string): string {
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        return s.slice(1, -1);
    }
    return s;
}

/**
 * Normaliza uma string para ser usada como chave de objeto:
 * minúsculas, sem acentos, e espaços/caracteres especiais viram underscore.
 * Ex: "Código (SKU)" -> "codigo_sku"
 */
function normalizeHeader(str: unknown): string {
    if (!str) return "";
    return String(str)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, " ")
        .trim()
        .replace(/\s+/g, "_");
}
