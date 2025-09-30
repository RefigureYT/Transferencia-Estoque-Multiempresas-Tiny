// ###   ./src/services/sheet.service.js   ###
import xlsx from "xlsx";
import path from "path";

/**
 * @description Essa função ela nada mais é que um filtro, será usada para filtrar qualquer valor de uma planilha.
 * @param {string} filePath - Caminho do arquivo `.xlsx` no disco.
 *  Exemplo: "./data/inventario.xlsx" ou "C:\\Users\\Lucas\\Desktop\\arquivo.xlsx"
 * 
 * @param {string} coluna - Nome do cabeçalho da coluna da planilha
 *  que você deseja usar no filtro.
 *  Este nome deve ser exatamente igual ao que aparece 
 *  na primeira linha (linha de cabeçalho) da planilha, ou a letra da coluna
 *  Exemplo: "Estoque Atual", "Preço", "A" ou "D"
 * 
 *
 * @param {string} filtro - Expressão de filtro aplicada aos valores da coluna.
 *   Pode ser uma comparação simples ou composta:
 *   - "=10" → apenas valores iguais a 10.
 *   - ">0" → apenas valores maiores que 0.
 *   - ">0 && <100" → valores entre 1 e 100.
 * 
 * @returns {Array<object>} - Lista de objetos representando
 *  as linhas que passaram no filtro
 */

// ! [REMOVIDO]
// * @param {string} paginaPlanilha - Nome da página da planilha que serão filtrados os valores, afinal uma planilha pode ter várias páginas.
// *  Fallback: Caso não seja enviado nada, o resultado será utilizar a primeira página da planilha

export function filtrarPlanilha(filePath, coluna, filtro, opts = {}) {
    const abs = path.resolve(filePath);
    const wb = xlsx.readFile(abs, { cellDates: true });

    const sheetName = opts.sheet || wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    if (!ws) throw new Error(`Aba não encontrada: ${sheetName}`);

    const rowsArr = xlsx.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
    if (rowsArr.length === 0) return [];

    // 1. Normaliza os cabeçalhos da primeira linha e remove os que resultarem em vazio
    const headers = rowsArr[0].map(normalizeHeader);
    const rawData = rowsArr.slice(1);

    // 2. Cria o array de objetos com as chaves já normalizadas
    const rowsObj = rawData.map(row => {
        const obj = {};
        headers.forEach((header, index) => {
            // Apenas adiciona a propriedade se o cabeçalho normalizado não for vazio
            if (header) {
                obj[header] = row[index];
            }
        });
        return obj;
    });

    // 3. Determina a chave a ser usada no filtro
    const isLetter = /^[A-Z]+$/.test(String(coluna).toUpperCase());
    let headerKey;

    if (isLetter) {
        const colIndex = colLetterToIndex(String(coluna).toUpperCase());
        headerKey = headers[colIndex]; // Pega o header já normalizado pelo índice
    } else {
        headerKey = normalizeHeader(coluna); // Normaliza o nome da coluna do filtro
    }

    if (!headerKey) {
        throw new Error(`Coluna "${coluna}" não encontrada ou resultou em um cabeçalho vazio.`);
    }

    const getValue = (obj) => obj[headerKey];
    const evaluator = buildFilterEvaluator(filtro);

    // 4. Filtra os resultados
    const result = [];
    for (const obj of rowsObj) {
        const val = getValue(obj);
        if (evaluator(val)) {
            result.push(obj);
        }
    }
    return result;
}

/* ========================= Helpers ========================= */

/** Converte "A" -> 0, "B" -> 1, ..., "AA" -> 26, etc. */
function colLetterToIndex(letter) {
    let idx = 0;
    for (let i = 0; i < letter.length; i++) {
        idx = idx * 26 + (letter.charCodeAt(i) - 64); // 'A' = 65
    }
    return idx - 1;
}

/** Normaliza string numérica BR/US para Number (ou NaN) */
function toNumber(val) {
    if (typeof val === "number") return val;
    const s = String(val ?? "").trim();
    if (!s) return NaN;
    // remove separador de milhar . e troca vírgula por ponto
    const norm = s.replace(/\./g, "").replace(",", ".");
    return /^[+-]?\d+(\.\d+)?$/.test(norm) ? Number(norm) : NaN;
}

/** Tenta comparar numericamente; se não der, compara como string */
function compare(a, b, op) {
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
        // string compare (case-sensitive por padrão)
        const sa = String(a ?? "");
        // Se valor do filtro veio entre aspas, preservamos como string pura
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
 *
 * Regras:
 * - Sem parênteses; precedência padrão: AND antes de OR (avaliamos explicitamente).
 * - Strings podem ser passadas com aspas ("Wow" ou 'Wow').
 */
function buildFilterEvaluator(exprRaw) {
    if (!exprRaw || !exprRaw.trim()) {
        // Sem filtro => tudo passa
        return () => true;
    }

    const expr = exprRaw.trim();

    // Divide por '||' (OR) de nível superior
    const orParts = splitTopLevel(expr, "||");

    const andGroups = orParts.map((part) => {
        const andParts = splitTopLevel(part, "&&").map((s) => s.trim()).filter(Boolean);
        return andParts.map(parseSimpleCondition); // cada condição simples vira um predicado
    });

    // Retorna função final: (AND de cada grupo) OR entre grupos
    return (value) => {
        return andGroups.some((group) => group.every((pred) => pred(value)));
    };
}

/** Divide expressão por um operador lógico top-level (sem parênteses aqui, então é split simples) */
function splitTopLevel(s, sep) {
    return s.split(sep).map((p) => p.trim()).filter(Boolean);
}

/**
 * Converte string de condição simples em predicado.
 * Aceita: =, ==, !=, >, >=, <, <=
 * Exemplos válidos: "=10", "== 'Wow'", ">= 5", "<=100"
 */
function parseSimpleCondition(condRaw) {
    const cond = condRaw.trim();

    // Normaliza "=" para "=="
    const norm = cond.replace(/^\s*=\s*/, "== ");

    // Padrão: operador + valor
    const m = norm.match(/^(==|!=|>=|<=|>|<)\s*(.+)$/);
    if (!m) {
        // Caso tenha sido passado só um valor (ex.: "Wow"), tratamos como == "Wow"
        const valOnly = stripQuotes(norm);
        return (v) => compare(v, valOnly, "==");
    }

    const op = m[1];
    const rhsRaw = m[2].trim();
    const rhs = stripQuotes(rhsRaw);

    return (v) => compare(v, rhs, op);
}

/** Remove aspas simples ou duplas das bordas, se existirem */
function stripQuotes(s) {
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
function normalizeHeader(str) {
    if (!str) return '';
    return str
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, ' ')
        .trim()
        .replace(/\s+/g, '_');
}