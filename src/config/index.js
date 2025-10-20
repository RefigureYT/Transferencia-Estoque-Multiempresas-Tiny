// ###  ./src/config/index.js  ###

// Esse script ele irá ler o .env e exportar as variáveis de ambiente para serem usadas em outros arquivos
import ConnectionParameters from 'pg/lib/connection-parameters';
import { conectarAoBanco } from '../services/database.service.js';
import { getAccessToken } from '../services/session.service.js';
import { getEstoqueProdTiny } from '../services/tinyApi.service.js';
import { listaEmpresasDefinidas } from '../main.js';

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

    /**
     * Cria uma variável que será preenchida com todas as empresas (dizendo se é master ou não)
     * O objetivo é, deve haver exatamente 1 true, caso tenha mais, significa que há mais de uma empresa como MASTER (Principal) e não pode.
     * Da mesma forma que se tiver menos está errado.
     */
    let masters = [];

    for (const empresa of empresas) {
        const nomeEmpresa = process.env[`${empresa}_NOME`]; // Obrigatório
        const tokenSource = process.env[`${empresa}_TOKEN_SOURCE`]; // Obrigatório ('db' ou 'env') 
        const idDeposito = process.env[`${empresa}_ID_DEPOSITO`]; // Obrigatório
        const userTiny = process.env[`${empresa}_USER_TINY`]; // Obrigatório
        const passTiny = process.env[`${empresa}_PASS_TINY`]; // Obrigatório
        const isMaster = process.env[`${empresa}_IS_MASTER`] === 'true'; // Não é obrigatório, fallback para false        
        let empresaToken = null;
        let tokenQuery = null;

        if (!nomeEmpresa) {
            console.error(`[❌ DADOS INCOMPLETOS] Por favor preencha o campo \"${empresa}_NOME\" para a empresa ${nomeEmpresa}/${empresa}.`);
            process.exit(1); // Encerra com erro.
        }

        if (idDeposito === undefined || idDeposito === null || idDeposito === '') {
            console.error(`[❌ DADOS INCOMPLETOS] Por favor preencha o campo \"${empresa}_ID_DEPOSITO\" para a empresa ${nomeEmpresa}/${empresa}.`);
            console.error('[❌ DADOS INCOMPLETOS] O script não será encerrado, ele listará os IDs de depósito disponíveis e então ele irá encerrar.');
        }

        if (!isMaster) { // O script só precisa das planilhas das contas que não são principal.
            if (!userTiny || !passTiny) {
                console.error(`[❌ DADOS INCOMPLETOS] Por favor preencha os campos \"${empresa}_USER_TINY\" e \"${empresa}_PASS_TINY\"`);
                console.error(`[❌ DADOS INCOMPLETOS] Sem eles não será possível baixar a planilha de estoque.`);
                process.exit(1); // Encerra com erro.
            }
        }

        if (tokenSource === 'env') {
            empresaToken = process.env[`${empresa}_TOKEN`]; // Somente se tokenSource for 'env'
            if (!empresaToken) {
                console.error(`[❌ DADOS INCOMPLETOS] Por favor preencha o campo \"${empresa}_TOKEN\" para a empresa ${nomeEmpresa}/${empresa}.`);
                process.exit(1); // Encerra com erro.
            }
        } else if (tokenSource === 'db') {
            tokenQuery = process.env[`${empresa}_TOKEN_QUERY`]; // Somente se tokenSource for 'db'
            if (!tokenQuery) {
                console.error(`[❌ DADOS INCOMPLETOS] Por favor preencha o campo \"${empresa}_TOKEN_QUERY\" para a empresa ${nomeEmpresa}/${empresa}.`);
                process.exit(1); // Encerra com erro.
            }
        } else {
            console.error(`[❌ DADOS INCOMPLETOS] Por favor, preencha corretamente o campo \"tokenSource\" com 'env' ou 'db' para a empresa ${nomeEmpresa}/${empresa}.`);
            process.exit(1); // Encerra com erro.
        }

        // console.log('Empresa:', empresa);
        // console.log('Nome da empresa:', nomeEmpresa);
        // console.log('Token Source:', tokenSource);
        // console.log('ID Depósito:', idDeposito);
        if (tokenSource === 'env') {
            // console.log('Token:', empresaToken);
        } else if (tokenSource === 'db') {
            // console.log('Token Query:', tokenQuery);
        }
        // console.log('É master:', isMaster);
        const obj = {
            empresa: empresa,
            isMaster: isMaster
        };
        masters.push(obj);
    }

    if (masters.filter(v => v.isMaster === true).length !== 1) {
        console.error(`[❌ DADOS INCOMPLETOS] Foi identificado que no .env há um erro com relação à empresa MASTER (principal).`);
        console.error('[❌ DADOS INCOMPLETOS] Lembrando que deve ter EXATAMENTE uma empresa master, deve haver somente uma!');
        console.log(masters);
        process.exit(1); // Encerra com erro.
    }

    console.log('✅ Todas as variáveis de ambiente obrigatórias estão definidas');


    // 2. Loga os valores das variáveis (mas não loga a senha por segurança)
    // console.log('--- Variáveis de Ambiente ---');
    // for (const variavel of variaveisObrigatorias) {
    //     if (variavel === 'DB_PASSWORD') {
    //         console.log(`${variavel}: ******** (não exibido por segurança)`);
    //     } else {
    //         console.log(`${variavel}: ${process.env[variavel]}`);
    //     }
    // }
    // console.log('------------------------------');

    // 3. Testa a conexão com o banco de dados
    const isConectado = await conectarAoBanco();
    return isConectado;
}

/**
 * @description Essa função ela basicamente busca toda a informação de dentro do .env
 *  e torna ela uma lista de empresas já com todas as informações da mesma.
 * @returns {Array<object>} - Retorna uma array de objetos, onde cada objeto da lista é uma empresa indicada no .env
 */

export function definirEmpresas() {
    const empresas = process.env.ACTIVE_COMPANIES.split(','); // Cria uma lista com as empresas. Exemplo: ["JP", "LT", "JF"]
    let listaCompleta = []; // Cria a lista que será retornada com todas as empresas definidas posteriormente.

    // Cria um looping que adiciona todas as informações de cada uma das empresas dentro da lista
    for (const empresa of empresas) {
        const nomeEmpresa = process.env[`${empresa}_NOME`]; // Obrigatório
        const userTiny = process.env[`${empresa}_USER_TINY`]; // Obrigatório
        const passTiny = process.env[`${empresa}_PASS_TINY`]; // Obrigatório
        const tokenSource = process.env[`${empresa}_TOKEN_SOURCE`]; // Obrigatório ('db' ou 'env')
        const idDeposito = process.env[`${empresa}_ID_DEPOSITO`];
        const isMaster = process.env[`${empresa}_IS_MASTER`] === 'true'; // Não é obrigatório, fallback para false
        const transfPositivo = process.env[`${empresa}_SALDO_POSITIVO`] === 'false' ? false : true; // Não é obrigatório, o default é true
        const transfNegativo = process.env[`${empresa}_SALDO_NEGATIVO`] === 'false' ? false : true; // Não é obrigatório, o default é true
        let empresaToken = null;
        let tokenQuery = null;

        let obj = {}; // Cria o objeto que será adicionado todos os dados das empresas definidas a partir do .env

        if (tokenSource === 'env') {
            empresaToken = process.env[`${empresa}_TOKEN`]; // Somente se tokenSource for 'env'
            if (!empresaToken) {
                console.error(`Por favor preencha o campo \"${empresa}_TOKEN\" para a empresa ${nomeEmpresa}/${empresa}.`);
                process.exit(1); // Encerra com erro.
            }

            obj = {
                empresa: empresa,
                nomeEmpresa: nomeEmpresa,
                userTiny,
                passTiny,
                tokenSource: tokenSource,
                idDeposito,
                transfPositivo,
                transfNegativo,
                isMaster: isMaster,
                empresaToken: empresaToken,
                tokenQuery: tokenQuery,
                accessToken: null
            };

            listaCompleta.push(obj);
        } else if (tokenSource === 'db') {
            tokenQuery = process.env[`${empresa}_TOKEN_QUERY`]; // Somente se tokenSource for 'db'
            if (!tokenQuery) {
                console.error(`Por favor preencha o campo \"${empresa}_TOKEN_QUERY\" para a empresa ${nomeEmpresa}/${empresa}.`);
                process.exit(1); // Encerra com erro.
            }

            obj = {
                empresa: empresa,
                nomeEmpresa: nomeEmpresa,
                userTiny,
                passTiny,
                tokenSource: tokenSource,
                idDeposito,
                transfPositivo,
                transfNegativo,
                isMaster: isMaster,
                empresaToken: empresaToken,
                tokenQuery: tokenQuery,
                accessToken: null
            };

            listaCompleta.push(obj);
        } else {
            console.error('======######======');
            console.error('ERRO INESPERADO!!!');
            console.error('======######======');
            console.error(`Por favor, preencha corretamente o campo \"tokenSource\" com 'env' ou 'db' para a empresa ${nomeEmpresa}/${empresa}.`);
            process.exit(1); // Encerra com erro.
        }
    }

    if (listaCompleta.length !== 0) { // Verifica se o conteúdo possui mais do que "nenhuma" empresa
        return listaCompleta;
    } else {
        console.error('======######======');
        console.error('ERRO INESPERADO!!!');
        console.error('listaCompleta.length === 0');
        console.error('======######======');
        process.exit(1) // Finaliza com erro
    }
}

/**
 * @description Essa função ela é chamada sempre que for identificada que no .env falta o id de algum depósito
 * ele listará todos os depósitos incluíndo os IDs para que o usuário (ou dev) adicione dentro do .env o ${empresa}_ID_DEPOSITO
 */
export async function semDepositosEnv() {

    console.log("Foi identificado que não há ID_DEPOSITO dentro do .env");
    console.log("LISTANDO DEPOSITOS...\n");

    let listaDepositos = {};

    for (const empresaDefinida of listaEmpresasDefinidas) {
        const depositos = await getEstoqueProdTiny(empresaDefinida.empresa);

        // filtra só os válidos
        // const rows = (depositos.depositos ?? []).filter(v => v.desconsiderar === false);
        const rows = depositos.depositos ?? [];

        // guarda no objeto usando o nome da empresa como chave
        listaDepositos[empresaDefinida.nomeEmpresa] = rows;
    }

    // Agora exibe de forma organizada
    for (const empresa of Object.keys(listaDepositos)) {
        console.log("=".repeat(70));
        console.log(`${empresa}`);
        console.log("=".repeat(70));

        // seleciona só colunas úteis
        const rows = listaDepositos[empresa].map(d => ({
            ID: d.id,
            Nome: d.nome ?? "",
            EstoqueConsiderado: d.desconsiderar ?? "false"
        }));

        console.table(rows);

        console.log("\n"); // linha em branco
    }
    process.exit(0); // DEBUG
}