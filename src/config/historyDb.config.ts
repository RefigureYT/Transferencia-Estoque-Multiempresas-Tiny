// ### ./src/config/historyDb.config.ts ###

import pg from "pg";

const { Pool } = pg;

export type HistoryDbMode =
    | { enabled: false }
    | {
        enabled: true;
        pool: pg.Pool;
        schema: string;
        table: string;
        resolveCompanyId: (empresa: string) => Promise<number>;
    };

function envBool(name: string): boolean {
    const v = process.env[name];
    if (v === undefined) {
        throw new Error(`[historyDb.config] Variável obrigatória ausente: ${name}`);
    }
    if (v !== "true" && v !== "false") {
        throw new Error(`[historyDb.config] Variável ${name} deve ser "true" ou "false" (recebido: "${v}")`);
    }
    return v === "true";
}

function requireEnv(name: string): string {
    const v = process.env[name];
    if (!v || !v.trim()) {
        throw new Error(`[historyDb.config] Variável obrigatória ausente ou vazia: ${name}`);
    }
    return v.trim();
}

function requireIntEnv(name: string): number {
    const raw = requireEnv(name);
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || Number.isNaN(n)) {
        throw new Error(`[historyDb.config] Variável ${name} deve ser um número inteiro válido (recebido: "${raw}")`);
    }
    return n;
}

/**
 * Evita SQL injection em schema/table vindos do .env
 */
function assertPgIdentifier(varName: string, value: string): string {
    const v = value.trim();
    // Identificador simples: letras, números e underscore, iniciando com letra/underscore
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(v)) {
        throw new Error(
            `[historyDb.config] ${varName} inválido: "${value}". Use apenas letras, números e "_" (não pode começar com número).`
        );
    }
    return v;
}

function getHistoryPool(): pg.Pool {
    const BUSCAR_ID_DB = envBool("BUSCAR_ID_EMPRESA_DB");

    // Regra do seu spec:
    // - Se BUSCAR_ID_EMPRESA_DB=true -> decide entre DB_* (default) ou HIST_DB_* (manual)
    // - Se BUSCAR_ID_EMPRESA_DB=false -> NÃO consulta banco para ID, mas AINDA pode registrar histórico.
    //   Como o spec não define conexão manual nesse modo, usamos DB_* (conexão padrão).
    const useDefaultConn = BUSCAR_ID_DB ? envBool("BUSCAR_ID_EMPRESA_DB_DEFAULT") : true;

    const host = useDefaultConn ? requireEnv("DB_HOST") : requireEnv("HIST_DB_HOST");
    const port = useDefaultConn ? requireIntEnv("DB_PORT") : requireIntEnv("HIST_DB_PORT");
    const user = useDefaultConn ? requireEnv("DB_USER") : requireEnv("HIST_DB_USER");
    const password = useDefaultConn ? requireEnv("DB_PASSWORD") : requireEnv("HIST_DB_PASS");
    const database = useDefaultConn ? requireEnv("DB_DATABASE") : requireEnv("HIST_DB_NAME");

    const ssl = (process.env.DB_SSL ?? "false") === "true";

    return new Pool({ host, port, user, password, database, ssl });
}

export function buildHistoryDbConfig(): HistoryDbMode {
    const REGISTRAR = envBool("REGISTRAR_HISTORICO_DB");

    // 1) Histórico totalmente desligado
    if (!REGISTRAR) {
        return { enabled: false };
    }

    // 2) Schema/table do histórico são SEMPRE obrigatórios quando registra
    const schema = assertPgIdentifier("HIST_DB_SCHEMA", requireEnv("HIST_DB_SCHEMA"));
    const table = assertPgIdentifier("HIST_DB_TABLE", requireEnv("HIST_DB_TABLE"));

    const BUSCAR_ID_DB = envBool("BUSCAR_ID_EMPRESA_DB");

    // 3) Pool SEMPRE existe quando enabled=true (remove o "pool fake/null")
    const pool = getHistoryPool();

    // 4) Resolve ID da empresa
    const resolveCompanyId = BUSCAR_ID_DB
        ? async (empresa: string) => {
            const emp = (empresa ?? "").trim();
            if (!emp) throw new Error(`[historyDb.config] Empresa inválida para buscar ID no banco (vazio).`);

            const sql = `
                    SELECT id
                    FROM ${schema}.empresas_tiny
                    WHERE codigo = $1
                    LIMIT 1
                `;

            const { rows } = await pool.query(sql, [emp]);
            if (!rows.length) {
                throw new Error(`[historyDb.config] Empresa não encontrada no banco: "${emp}" (tabela: ${schema}.empresas)`);
            }

            const id = Number(rows[0].id);
            if (!Number.isFinite(id) || Number.isNaN(id)) {
                throw new Error(`[historyDb.config] ID inválido retornado do banco para empresa "${emp}": ${String(rows[0].id)}`);
            }

            return id;
        }
        : async (empresa: string) => {
            const emp = (empresa ?? "").trim();
            if (!emp) throw new Error(`[historyDb.config] Empresa inválida para buscar ID no .env (vazio).`);

            const key = `${emp}_ID_DB`;
            const raw = process.env[key];

            if (!raw || !raw.trim()) {
                throw new Error(`[historyDb.config] ID da empresa não definido no .env: ${key}`);
            }

            const id = Number.parseInt(raw.trim(), 10);
            if (!Number.isFinite(id) || Number.isNaN(id)) {
                throw new Error(`[historyDb.config] Valor inválido para ${key}: "${raw}" (esperado inteiro)`);
            }

            return id;
        };

    return {
        enabled: true,
        pool,
        schema,
        table,
        resolveCompanyId,
    };
}
