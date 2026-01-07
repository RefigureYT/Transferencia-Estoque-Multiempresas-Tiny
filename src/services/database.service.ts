// ### ./src/services/database.service.ts ###

import dotenv from "dotenv";
dotenv.config();

import pg from "pg";
import { sendMessageMain } from "../main.js";

const { Pool } = pg;

type PoolConfig = {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
    ssl?: boolean;
};

const poolConfig: PoolConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: process.env.DB_SSL === "true",
};

// console.log('poolConfig ->', poolConfig);

const pool = new Pool(poolConfig);

// 2. ADICIONAMOS O "OUVINTE" DE EVENTOS
// Isso vai nos dizer o que está acontecendo por baixo dos panos.
pool.on("error", (_err: Error) => {
    // console.error('❌ ERRO INESPERADO no cliente do banco de dados!', err);
    // process.exit(-1); // Em caso de erro grave, encerra a aplicação.
});

pool.on("connect", (_client: pg.PoolClient) => {
    // console.log('ℹ️ EVENTO: Um cliente se conectou ao banco de dados.');
    // console.log(`   - Processo ID do cliente: ${client.processID}`);
});

pool.on("acquire", (_client: pg.PoolClient) => {
    // console.log('ℹ️ EVENTO: Uma conexão foi "adquirida" do pool e está pronta para uso.');
});

pool.on("remove", (_client: pg.PoolClient) => {
    // console.log('ℹ️ EVENTO: Uma conexão foi "removida" e devolvida ao pool.');
});

/**
 * @description Testa a conexão com o banco de dados usando variáveis de ambiente.
 * @returns Retorna true se a conexão for bem-sucedida, caso contrário, retorna false.
 */
export async function conectarAoBanco(): Promise<boolean> {
    const hostBanco = process.env.DB_HOST;
    const user = process.env.DB_USER;

    // console.log(`[database.js] Tentando conectar ao banco no host: ${hostBanco} com o usuário: ${user}`);
    let client: pg.PoolClient | undefined;

    try {
        client = await pool.connect();
        return true;
    } catch (err: unknown) {
        const error = err as { message?: string };
        console.error(`[database.js] Erro ao conectar ao banco de dados: ${error?.message ?? String(err)}`);
        await sendMessageMain(`❌ Erro ao conectar ao banco de dados: ${error?.message ?? String(err)}`);
        return false;
    } finally {
        if (client) client.release();
    }
}

/**
 * @description Executa um comando SQL (query) no banco de dados.
 * @param sqlCommand - O comando SQL que vai ser executado. Use $1, $2 para parâmetros.
 * @param params - Array com os valores para substituir $1, $2, etc.
 * @returns Um array com as linhas retornadas pela query.
 */
export async function executarQueryInDb<T = Record<string, unknown>>(
    sqlCommand: string,
    params: unknown[] = []
): Promise<T[]> {
    let client: pg.PoolClient | undefined;

    try {
        client = await pool.connect();
        const resultado = await client.query(sqlCommand, params);
        return resultado.rows as T[];
    } catch (err: unknown) {
        const error = err as { message?: string };
        console.error("❌ Erro ao executar comando no banco de dados:", error?.message ?? String(err));
        await sendMessageMain(`❌ Erro ao executar comando no banco de dados: ${error?.message ?? String(err)}`);
        throw err;
    } finally {
        if (client) client.release();
    }
}

/**
 * @description Executa uma transação no banco garantindo COMMIT/ROLLBACK no mesmo client.
 * @param fn - Função que recebe o client transacional.
 */
export async function executarTransacaoInDb<T>(
    fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
    let client: pg.PoolClient | undefined;

    try {
        client = await pool.connect();
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
    } catch (err: unknown) {
        if (client) {
            try { await client.query("ROLLBACK"); } catch { }
        }
        const error = err as { message?: string };
        console.error("❌ Erro em transação no banco:", error?.message ?? String(err));
        await sendMessageMain(`❌ Erro em transação no banco: ${error?.message ?? String(err)}`);
        throw err;
    } finally {
        if (client) client.release();
    }
}
