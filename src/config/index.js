// ###  ./src/config/index.js  ###

// Esse script ele irá ler o .env e exportar as variáveis de ambiente para serem usadas em outros arquivos
import { conectarAoBanco } from '../services/database.service.js';

// Agora, as variáveis já estão em process.env
export async function logEnvVariables() {
    // ---- Verificação Manual ----
    // 1. Verifica se as variáveis essenciais estão definidas
    const variaveisObrigatorias = [
        'DB_HOST',
        'DB_PORT',
        'DB_USER',
        'DB_PASSWORD',
        'DB_DATABASE',
        'DB_SSL',
        'ACTIVE_COMPANIES'
    ]

    const variaveisFaltando = variaveisObrigatorias.filter(v => !process.env[v]);

    if (variaveisFaltando.length > 0) {
        console.error(`❌ Erro: As seguintes variáveis de ambiente estão faltando no .env: ${variaveisFaltando.join(', ')}`);
        return false; // Retorna false para indicar falha na validação
    }

    // Agora ele verifica as empresas declaradas e verifica se falta alguma informação
    const empresas = process.env.ACTIVE_COMPANIES.split(',');
    for (const empresa of empresas) {
        const nomeEmpresa = process.env[`${empresa}_NOME`]; // Obrigatório
        const tokenSource = process.env[`${empresa}_TOKEN_SOURCE`]; // Obrigatório ('db' ou 'env') 
        const isMaster = process.env[`${empresa}_IS_MASTER`] === 'true'; // Não é obrigatório, fallback para false
        let empresaToken = null;
        let tokenQuery = null;

        if (tokenSource === 'env'){
            empresaToken = process.env[`${empresa}_TOKEN`]; // Somente se tokenSource for 'env'
        } else if (tokenSource === 'db') {
            tokenQuery = process.env[`${empresa}_TOKEN_QUERY`]; // Somente se tokenSource for 'db'
        } else {
            console.error(`Por favor, preencha corretamente o campo \"tokenSource\" com 'env' ou 'db' para a empresa ${nomeEmpresa}/${empresa}.`);
            process.exit(1); // Encerra com erro.
        }

        console.log('Empresa:', empresa);
        console.log('Nome da empresa:', nomeEmpresa);
        console.log('Token Source:', tokenSource);
        console.log('Token Query:', tokenQuery);
        console.log('É master:', isMaster);
    }
    process.exit(0); // DEBUG

    console.log('✅ Todas as variáveis de ambiente obrigatórias estão definidas.');

    // 2. Loga os valores das variáveis (mas não loga a senha por segurança)
    console.log('--- Variáveis de Ambiente ---');
    for (const variavel of variaveisObrigatorias) {
        if (variavel === 'DB_PASSWORD') {
            console.log(`${variavel}: ******** (não exibido por segurança)`);
        } else {
            console.log(`${variavel}: ${process.env[variavel]}`);
        }
    }
    console.log('------------------------------');

    // 3. Testa a conexão com o banco de dados
    const isConectado = await conectarAoBanco();
    return isConectado;
}