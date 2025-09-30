// ###   ./src/services/tinyApi.service.js   ###

// IMPORTS
import axios from 'axios';
import { DateTime } from "luxon";

import { executarQueryInDb } from './database.service.js';
import { listaEmpresasDefinidas } from '../main.js';
import { getAccessToken, revalidarToken } from './session.service.js';

const _url = 'https://api.tiny.com.br/public-api/v3'; // UrlTinyDefault

/**
 * Função auxiliar para criar um atraso (delay).
 * @param {number} ms - O tempo de espera em milissegundos.
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class TinyApiError extends Error {
    /**
     * Cria uma instância de um erro customizado para a API da Tiny.
     * @param {string} message - A mensagem principal do erro.
     * @param {object} context - Um objeto contendo o contexto do erro.
     * @param {number} context.status - O status HTTP da resposta (ex: 404, 500).
     * @param {string} context.url - A URL que foi chamada.
     * @param {string} context.method - O método HTTP usado (ex: 'POST', 'GET').
     * @param {object} context.requestData - O corpo (body) da requisição enviada.
     * @param {object} context.responseData - Os dados (data) da resposta de erro recebida da API.
     * @param {object} context.headers - Os cabeçalhos da requisição (com dados sensíveis mascarados).
     */
    constructor(message, { status, url, method, requestData, responseData, headers }) {
        super(message);
        this.name = "TinyApiError";
        this.status = status;
        this.url = url;
        this.method = method;
        this.requestData = requestData;
        this.responseData = responseData;
        this.headers = headers;
    }
}

export async function buscarNovoTokenDaAPI(querySql) {
    // console.log('Tentando buscar chave de API');
    // console.log(`Query: ${querySql}`);
    const resultado = await executarQueryInDb(querySql, []);
    return resultado;
}

/**
 * @description Busca um produto na API da Tiny com uma lógica robusta de retentativas.
 * A função lida automaticamente com tokens de acesso expirados (erros 401/403),
 * revalidando-os e tentando novamente. Também gerencia limites de requisição da API (erro 429),
 * esperando por um período progressivo antes de tentar novamente.
 * 
 * @async
 * @param {string} typeQuery - O tipo de filtro a ser usado na busca (ex: 'codigo', 'nome', 'id').
 * @param {string|number} query - O valor a ser buscado, correspondente ao typeQuery (ex: 'JP0001').
 * @param {string} empresa - A sigla ou nome da empresa (ex: 'JP') para identificar qual configuração e token usar.
 * @returns {Promise<object>} Uma Promise que resolve com o objeto de dados do produto retornado pela API.
 * @throws {Error} Lança um erro nas seguintes condições:
 *  - Se a empresa não for encontrada nas configurações.
 *  - Se ocorrer um erro de rede ou um erro inesperado que não seja de API.
 *  - Se a API continuar retornando 'Too Many Requests' (429) após todas as tentativas de espera.
 *  - Se ocorrer um erro de API não tratável (ex: 404, 500).
 *  - Se a retentativa após um token inválido também falhar por um motivo diferente.
 */

export async function getProdTiny(typeQuery, query, empresa, situacao = 'A') {
    // Primeiro ele encontra o objeto empresa antes de tudo
    const empresaTiny = listaEmpresasDefinidas.find(v => v.empresa === empresa || v.nomeEmpresa.includes(empresa));

    if (!empresaTiny) {
        console.error(`❌ Empresa "${empresa}" não encontrada na lista de configurações.`);
        process.exit(1); // Encerra com erro
    }

    // 2. Defina a estratégia de espera para o erro 429
    const temposDeEspera = [10, 20, 40, 60, 120]; // Em segundos
    const maxTentativas = temposDeEspera.length;

    // 3. Loop de tentativas
    for (let tentativa = 0; tentativa < maxTentativas; tentativa++) {

        try {
            // 2. Tenta fazer a chamada à API.
            // console.log(`[API] Buscando produto para a empresa ${empresa}...`);
            let auth = `Bearer ${empresaTiny.accessToken}`;
            const config = { headers: { authorization: auth } };
            const _urlMontada = `${_url}/produtos?${typeQuery}=${query}&situacao=${situacao}`;

            if (tentativa > 2) {
                console.log(`[Tentativa ${tentativa + 1}/${maxTentativas}] Buscando produto para a empresa ${empresa}...`);
            }
            const response = await axios.get(_urlMontada, config);

            // Se chegou aqui, deu certo!
            // console.log(`✅ Sucesso! Produto encontrado para a empresa ${empresa}.`);
            return response.data; // Retorna o resultado e sai da função

        } catch (err) {
            // Se não houver 'err.response', é um erro de rede ou outro problema.
            if (!err.response) {
                console.error('❌ Erro de rede ou inesperado:', err.message);
                throw err.message; // Lança o erro e para, pois não é um erro de API tratável.
            }

            const status = err.response.status;

            // 3. Se der erro, verifica se é de autenticação ou Too Many Requests
            //      (err.response && err.response.status é a forma mais segura de verificar)
            if (status === 401 || status === 403) {
                console.warn(`[API] Token inválido/expirado (Erro ${err.response.status}). Tentando revalidar...`);
                console.log('Tentando buscar outro token...');

                // 4. Busca novo token
                await revalidarToken(empresaTiny.tokenQuery);
                // A "mágica" da referência já atualizou o accessToken em empresaTiny.

                // 5. TENTA DE NOVO! (Bota pra rodar de novo ksksks reinicia o loop)
                continue;
            }

            // Lógica para 429 (Too Many Requests)
            if (status === 429) {
                const tempoEsperaSegundos = temposDeEspera[tentativa];
                console.warn(`[Erro ${status}] Too Many Requests. A API está sobrecarregada.`);

                // Verifica se ainda há tentativas restantes
                if (tentativa < maxTentativas - 1) {
                    console.log(`Aguardando ${tempoEsperaSegundos} segundos antes de tentar novamente...`);
                    await sleep(tempoEsperaSegundos * 1000); // Converte segundos para milissegundos
                    // O loop continuará para a próxima iteração após a espera.
                } else {
                    // Se for a última tentativa, lança o erro final.
                    console.error(`❌ FALHA: A API continuou retornando 'Too Many Requests' após ${maxTentativas} tentativas.`);
                    throw new Error(`API sobrecarregada. Falha após ${maxTentativas} tentativas.`);
                }
                continue; // Garante que o loop continue para a próxima iteração
            }

            if (status === 404) {
                console.error('[❌ ERRO - tinyApi.service.js] Não foi encontrado o cadastro deste produto.');
                return [];
            }
            // Se for qualquer outro erro de API (404, 500, etc.), não adianta tentar de novo.
            // Para todos os outros erros, lança o erro detalhado
            throw new TinyApiError(`❌ Erro de API não tratável. Erro ao buscar produto na empresa ${empresa}.`, {
                status: status || 'SEM_STATUS',
                url,
                method,
                responseData: err?.response?.data,
                headers: { ...headers, authorization: "***TOKEN_MASCARADO***" }
            });
        }
    }
}


/**
 * @description
 * Realiza a movimentação de estoque de um produto específico na API da Tiny.
 * Esta função é projetada para ser resiliente, implementando uma lógica robusta de retentativas automáticas
 * para lidar com os cenários mais comuns de falha em APIs:
 *
 * - **Fallback de Autenticação (Erros 401/403):** Se o token de acesso estiver expirado ou for inválido,
 *   a função irá automaticamente solicitar um novo token e tentará a operação novamente.
 *
 * - **Fallback de Limite de Requisições (Erro 429):** Se a API retornar "Too Many Requests", indicando
 *   sobrecarga, a função aguardará um tempo progressivo (backoff exponencial) antes de tentar
 *   novamente, respeitando os limites da API.
 *
 * A operação consiste em um `POST` para o endpoint `/estoque/{idProd}` do ERP Tiny.
 *
 * @async
 * @function editEstoqueProdTiny
 *
 * @param {string} fromEmpresa - A sigla da empresa que está executando a ação (ex: 'JP'). Este parâmetro é crucial para determinar qual token de autenticação será utilizado.
 * @param {string|number} idProd - O ID único do produto na plataforma Tiny cujo estoque será alterado.
 * @param {string} tipoMovimento - Define a natureza da movimentação. Valores permitidos são 'E'/'e' (Entrada), 'S'/'s' (Saída) ou 'B'/'b' (Balanço).
 * @param {number} qtdProd - A quantidade de unidades do produto a ser movimentada. Deve ser um número inteiro.
 * @param {string|number} idEstoque - O ID do depósito (estoque) onde a movimentação ocorrerá.
 * @param {string} toEmpresa - A sigla da empresa de destino. Usado principalmente para gerar uma observação clara no registro de movimentação (ex: "Transferência de JP para SP").
 * @param {number} [precoUnitario=0] - Opcional. O custo ou preço unitário associado à movimentação. O valor padrão é 0.
 *
 * @returns {Promise<object>} Uma Promise que, em caso de sucesso, resolve com o objeto de resposta da API da Tiny.
 * Ex: `{ "idLancamento": 901853015 }`
 *
 * @throws {Error} A função lançará um erro em cenários onde a retentativa não é possível ou falhou. Isso ocorre em casos como:
 *  - **Configuração Inválida:** Se a `fromEmpresa` não for encontrada nas configurações globais.
 *  - **Falha Crítica de API:** Se a API retornar um erro não recuperável (ex: 404 Not Found, 500 Internal Server Error).
 *  - **Falha Persistente:** Se a API continuar retornando erro 429 (Too Many Requests) mesmo após todas as tentativas de espera.
 *  - **Erro de Rede:** Se houver uma falha de conexão com a API.
 */

export async function editEstoqueProdTiny(fromEmpresa, idProd, tipoMovimento, qtdProd, idEstoque, toEmpresa, precoUnitario = 0) {
    // Primeiro ele encontra o objeto empresa antes de tudo 
    const empresaTiny = listaEmpresasDefinidas.find(v => v.empresa === fromEmpresa || v.nomeEmpresa.includes(fromEmpresa));

    if (!empresaTiny) {
        console.error(`❌ Empresa "${fromEmpresa}" não encontrada na lista de configurações.`);
        process.exit(1); // Encerra com erro
    }

    // -=-=-=- DEBUG -=-=-=-
    // console.log(empresaTiny);
    // console.log(empresaTiny.accessToken);
    // -=-=-=- DEBUG -=-=-=-

    // 2. Defina a estratégia de espera para o erro 429
    const temposDeEspera = [10, 20, 40, 60, 120]; // Em segundos
    const maxTentativas = temposDeEspera.length;

    // 3. Loop de tentativas
    for (let tentativa = 0; tentativa < maxTentativas; tentativa++) {

        try {
            // 2. Tenta fazer a chamada à API.
            let auth = `Bearer ${empresaTiny.accessToken}`;
            const config = { headers: { authorization: auth } };
            const _urlMontada = `${_url}/estoque/${idProd}`;

            // Captura DATA (tempo)
            const now = DateTime.now().setZone("America/Sao_Paulo");
            const dataFormatada = now.toFormat("yyyy-LL-dd HH:mm:ss");

            const setaMovimentacao = tipoMovimento.toUpperCase() === 'E' ? '<-' :
                tipoMovimento.toUpperCase() === 'S' ? '->' : '-';


            // Cria Body
            const data = {
                deposito: {
                    id: parseInt(idEstoque)
                },
                tipo: tipoMovimento.toUpperCase(),
                data: dataFormatada,
                quantidade: parseInt(qtdProd),
                precoUnitario: parseInt(precoUnitario),
                observacoes: `Transferência entre empresas | ${fromEmpresa} ${setaMovimentacao} ${toEmpresa} | Script Kelvin`
            };

            // -=-=-=-=- DEBUG -=-=-=-=- 
            // console.log('urlMontada:', _urlMontada);
            // console.log('body', data);
            // console.log('headers', config);
            // -=-=-=-=- DEBUG -=-=-=-=- 

            if (tentativa > 2) {
                console.log(`[Tentativa ${tentativa + 1}/${maxTentativas}] Alterando estoque para a empresa ${fromEmpresa}...`);
            }
            const response = await axios.post(_urlMontada, data, config);

            // Se chegou aqui, deu certo!
            console.log(`✅ Sucesso! Estoque alterado para a empresa ${fromEmpresa}.`);
            return response.data; // Retorna o resultado e sai da função

        } catch (err) {
            // Se não houver 'err.response', é um erro de rede ou outro problema.
            if (!err.response) {
                console.error('❌ Erro de rede ou inesperado:', err.message);
                throw err.message; // Lança o erro e para, pois não é um erro de API tratável.
            }

            const status = err.response.status;

            // 3. Se der erro, verifica se é de autenticação ou Too Many Requests
            //      (err.response && err.response.status é a forma mais segura de verificar)
            if (status === 401 || status === 403) {
                console.warn(`[API] Token inválido/expirado (Erro ${err.response.status}). Tentando revalidar...`);
                console.log('Tentando buscar outro token...');

                // 4. Busca novo token
                await revalidarToken(empresaTiny.tokenQuery);
                // A "mágica" da referência já atualizou o accessToken em empresaTiny.

                console.log('Erro recebido:', err.message);

                // 5. TENTA DE NOVO! (Bota pra rodar de novo ksksks reinicia o loop)
                continue;
            }

            // Lógica para 429 (Too Many Requests)
            if (status === 429) {
                const tempoEsperaSegundos = temposDeEspera[tentativa];
                console.warn(`[Erro ${status}] Too Many Requests. A API está sobrecarregada.`);

                // Verifica se ainda há tentativas restantes
                if (tentativa < maxTentativas - 1) {
                    console.log(`Aguardando ${tempoEsperaSegundos} segundos antes de tentar novamente...`);
                    await sleep(tempoEsperaSegundos * 1000); // Converte segundos para milissegundos
                    // O loop continuará para a próxima iteração após a espera.
                } else {
                    // Se for a última tentativa, lança o erro final.
                    console.error(`❌ FALHA: A API continuou retornando 'Too Many Requests' após ${maxTentativas} tentativas.`);
                    throw new Error(`API sobrecarregada. Falha após ${maxTentativas} tentativas.`);
                }
                continue; // Garante que o loop continue para a próxima iteração
            }

            // Se for qualquer outro erro de API (404, 500, etc.), não adianta tentar de novo.
            console.error(`❌ Erro de API não tratável (Status: ${status}).`, err.message);
            throw err.message; // Lança o erro e para.
        }
    }
}

export async function getEstoqueProdTiny(empresa) {
    // Primeiro ele encontra o objeto empresa antes de tudo
    const empresaTiny = listaEmpresasDefinidas.find(v => v.empresa === empresa || v.nomeEmpresa.includes(empresa));

    if (!empresaTiny) {
        console.error(`❌ Empresa "${empresa}" não encontrada na lista de configurações.`);
        process.exit(1); // Encerra com erro
    }

    // 2. Defina a estratégia de espera para o erro 429
    const temposDeEspera = [10, 20, 40, 60, 120]; // Em segundos
    const maxTentativas = temposDeEspera.length;

    // 3. Loop de tentativas
    for (let tentativa = 0; tentativa < maxTentativas; tentativa++) {

        try {

            const prod = await getProdTiny('limit', '1', empresa);
            const idProd = prod.itens[0].id;

            // 2. Tenta fazer a chamada à API.
            let auth = `Bearer ${empresaTiny.accessToken}`;
            const config = { headers: { authorization: auth } };
            const _urlMontada = `${_url}/estoque/${idProd}`;

            if (tentativa > 2) {
                console.log(`[Tentativa ${tentativa + 1}/${maxTentativas}] Buscando estoques para a empresa ${empresa}...`);
            }
            const response = await axios.get(_urlMontada, config);

            // Se chegou aqui, deu certo!
            console.log(`✅ Sucesso! Depósitos encontrado para a empresa ${empresa}.`);
            return response.data; // Retorna o resultado e sai da função

        } catch (err) {
            // Se não houver 'err.response', é um erro de rede ou outro problema.
            if (!err.response) {
                console.error('❌ Erro de rede ou inesperado:', err.message);
                throw err.message; // Lança o erro e para, pois não é um erro de API tratável.
            }

            const status = err.response.status;

            // 3. Se der erro, verifica se é de autenticação ou Too Many Requests
            //      (err.response && err.response.status é a forma mais segura de verificar)
            if (status === 401 || status === 403) {
                console.warn(`[API] Token inválido/expirado (Erro ${err.response.status}). Tentando revalidar...`);
                console.log('Tentando buscar outro token...');

                // 4. Busca novo token
                await revalidarToken(empresaTiny.tokenQuery);
                // A "mágica" da referência já atualizou o accessToken em empresaTiny.

                // 5. TENTA DE NOVO! (Bota pra rodar de novo ksksks reinicia o loop)
                continue;
            }

            // Lógica para 429 (Too Many Requests)
            if (status === 429) {
                const tempoEsperaSegundos = temposDeEspera[tentativa];
                console.warn(`[Erro ${status}] Too Many Requests. A API está sobrecarregada.`);

                // Verifica se ainda há tentativas restantes
                if (tentativa < maxTentativas - 1) {
                    console.log(`Aguardando ${tempoEsperaSegundos} segundos antes de tentar novamente...`);
                    await sleep(tempoEsperaSegundos * 1000); // Converte segundos para milissegundos
                    // O loop continuará para a próxima iteração após a espera.
                } else {
                    // Se for a última tentativa, lança o erro final.
                    console.error(`❌ FALHA: A API continuou retornando 'Too Many Requests' após ${maxTentativas} tentativas.`);
                    throw new Error(`API sobrecarregada. Falha após ${maxTentativas} tentativas.`);
                }
                continue; // Garante que o loop continue para a próxima iteração
            }

            // Para QUALQUER outro erro (404, 500, etc.), lança o TinyApiError com todos os detalhes. (não adianta tentar de novo)
            // Isso vai "entregar" o erro para o código que chamou esta função.
            throw new TinyApiError(`❌ Erro de API não tratável ao alterar estoque.`, {
                status: status || 'SEM_STATUS', // Garante que status sempre tenha um valor
                url,
                method,
                requestData,
                responseData: err?.response?.data,
                headers: { ...headers, authorization: "***TOKEN_MASCARADO***" } // Mascara o token por segurança
            });
        }
    }
}