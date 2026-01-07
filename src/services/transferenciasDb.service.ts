import { executarTransacaoInDb } from "./database.service.js";
import { buildHistoryDbConfig } from "../config/historyDb.config.js";
import type pg from "pg";
import type { Pool } from "pg";

type TransferenciaItem = {
    idProdutoTiny: string | number;
    skuProduto: string;
    nomeProduto: string;
    quantidade: number;

    empresaEntradaId: number;
    empresaSaidaId: number;

    idLancamento: number;
    tipoLancamento: "S" | "E";
};

const historyDbConfig = buildHistoryDbConfig();

/**
 * Segurança mínima: schema/table vindo do .env NÃO pode ser "qualquer string".
 * Evita SQL injection via identificador (schema/tabela não aceitam bind $1).
 */
function assertSqlIdentifier(envName: string, value: string): void {
    // Postgres identifier simples: letras/dígitos/underscore, não começa com dígito
    // (sem aspas, sem ponto, sem espaço)
    const ok = /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
    if (!ok) {
        throw new Error(
            `Valor inválido para ${envName}: "${value}". Use apenas letras, números e underscore, sem espaços/pontos/aspas.`
        );
    }
}

let _insertTarget: string | null = null;

function getInsertTargetOrThrow(): string {
    if (_insertTarget) return _insertTarget;

    if (!historyDbConfig.enabled) {
        throw new Error(
            "Histórico está desabilitado (REGISTRAR_HISTORICO_DB=false). Não deveria tentar inserir histórico."
        );
    }

    const schema = historyDbConfig.schema;
    const table = historyDbConfig.table;

    assertSqlIdentifier("HIST_DB_SCHEMA", schema);
    assertSqlIdentifier("HIST_DB_TABLE", table);

    _insertTarget = `${schema}.${table}`;
    return _insertTarget;
}

function hasUsablePool(pool: unknown): pool is Pool {
    return !!pool && typeof (pool as Pool).connect === "function";
}

async function executarTransacaoHistorico<T>(
    fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
    // Se o historyDbConfig tiver pool real, usa ele (suporta DB histórico custom).
    // Se não tiver (caso BUSCAR_ID_EMPRESA_DB=false no seu config atual), cai pro DB padrão.
    const poolCandidate: unknown = (historyDbConfig as any).pool;

    if (historyDbConfig.enabled && hasUsablePool(poolCandidate)) {
        const pool = poolCandidate; // agora TS sabe que é Pool
        let client: pg.PoolClient | null = null;

        try {
            client = await pool.connect();
            await client.query("BEGIN");

            const result = await fn(client);

            await client.query("COMMIT");
            return result;
        } catch (err: unknown) {
            if (client) {
                try {
                    await client.query("ROLLBACK");
                } catch {
                    // noop
                }
            }
            throw err;
        } finally {
            if (client) client.release();
        }
    }

    // fallback: DB padrão
    return await executarTransacaoInDb(fn);
}

async function inserirItem(client: pg.PoolClient, item: TransferenciaItem): Promise<void> {
    const target = getInsertTargetOrThrow();

    const sql = `
        INSERT INTO ${target}
        (
          id_produto_tiny, sku_produto, nome_produto, quantidade,
          empresa_entrada, empresa_saida,
          id_lancamento, tipo_lancamento,
          data, exportado, data_exportado
        )
        VALUES
        (
          $1,$2,$3,$4,
          $5,$6,
          $7,$8,
          NOW(), FALSE, NULL
        )
        ON CONFLICT (id_lancamento, id_produto_tiny, tipo_lancamento)
        DO NOTHING;
    `;

    await client.query(sql, [
        item.idProdutoTiny,
        item.skuProduto,
        item.nomeProduto,
        item.quantidade,
        item.empresaEntradaId,
        item.empresaSaidaId,
        item.idLancamento,
        item.tipoLancamento,
    ]);
}

/**
 * Registra o par (Saída + Entrada) na tabela de histórico (se habilitado no .env).
 *
 * Regras:
 * - REGISTRAR_HISTORICO_DB=false -> no-op (não encosta em DB de histórico)
 * - REGISTRAR_HISTORICO_DB=true  -> insere em HIST_DB_SCHEMA.HIST_DB_TABLE
 * - Se existir pool de histórico (config) usa ele; senão usa o DB padrão
 */
export async function registrarTransferenciaParNoDb(
    saida: TransferenciaItem,
    entrada: TransferenciaItem
): Promise<void> {
    if (!historyDbConfig.enabled) return;

    await executarTransacaoHistorico(async (client) => {
        await inserirItem(client, saida);
        await inserirItem(client, entrada);
    });
}
