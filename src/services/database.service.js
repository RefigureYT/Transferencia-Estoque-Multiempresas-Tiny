// ### ./src/services/database.service.js ###
import dotenv from 'dotenv';
dotenv.config();
import pg from 'pg';

const { Pool } = pg;
const poolConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: process.env.DB_SSL === 'true'
}
console.log('poolConfig ->', poolConfig);

const pool = new Pool(poolConfig);

// 2. ADICIONAMOS O "OUVINTE" DE EVENTOS
// Isso vai nos dizer o que está acontecendo por baixo dos panos.
pool.on('error', (err, client) => {
    console.error('❌ ERRO INESPERADO no cliente do banco de dados!', err);
    process.exit(-1); // Em caso de erro grave, encerra a aplicação.
});

pool.on('connect', (client) => {
    console.log('ℹ️ EVENTO: Um cliente se conectou ao banco de dados.');
    // Podemos até ver de onde ele está se conectando
    console.log(`   - Processo ID do cliente: ${client.processID}`);
});

pool.on('acquire', (client) => {
    console.log('ℹ️ EVENTO: Uma conexão foi "adquirida" do pool e está pronta para uso.');
});

pool.on('remove', (client) => {
    console.log('ℹ️ EVENTO: Uma conexão foi "removida" e devolvida ao pool.');
});

/**
 * @description Testa a conexão com o banco de dados usando variáveis de ambiente.
 * @returns {Promise<boolean>} Retorna true se a conexão for bem-sucedida, caso contrário, lança um erro.
 */

export async function conectarAoBanco() {
    const hostBanco = process.env.DB_HOST;
    const user = process.env.DB_USER;

    console.log(`[database.js] Tentando conectar ao banco no host: ${hostBanco} com o usuário: ${user}`);
    let client;
    try {
        console.log('Tentando se conectar ao banco de dados...');
        client = await pool.connect();
        console.log('Conexão bem-sucedida ao banco de dados!');
        return true; // Retorna true porque a conexão foi bem-sucedida
    }
    catch (error) {
        console.error(`[database.js] Erro ao conectar ao banco de dados: ${error.message}`);
        return false; // Retorna false porque houve um erro na conexão
    } finally {
        if (client) {
            console.log('Devolvendo a conexão ao pool...');
            client.release();
            console.log('Conexão devolvida ao pool.');
        }
    }
}

/** 
 * @description Executa um comando SQL (query) no banco de dados.
 * @param {string} sqlCommand - O comando SQL que vai ser executado. Use $1, $2 para parâmetros.
 * @param {Array} params - Uma array com os valores para substituir $1, $2, etc.
 * @returns {Promise<Array>} Um array com as linhas retornadas pela query.
 */

export async function executarQueryInDb(sqlCommand, params = []) {
    let client;
    try {
        client = await pool.connect();
        console.log('Executando comando:', { sqlCommand, params });
        const resultado = await client.query(sqlCommand, params);
        console.log(`Comando executado com sucesso, ${resultado.rowCount} linhas retornadas/afetadas.`);
        return resultado.rows;
    } catch (error) {
        console.error("❌ Erro ao executar comando no banco de dados:", error.message);
        // Lança o erro para que a função que chamou saiba que algo deu errado
        throw error;
    } finally {
        if (client) {
            console.log('Devolvendo a conexão ao pool...');
            client.release();
            console.log('Conexão devolvida ao pool.');
        }
    }
}