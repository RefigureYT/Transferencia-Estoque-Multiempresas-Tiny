// ###   ./src/services/session.service.js   ###
import { buscarNovoTokenDaAPI } from './tinyApi.service.js';

let _accessToken = null;

/**
 * @description Obtém o token de acesso atual. Se não houver um, busca um novo.
 * Esta é a principal função que 99% da aplicação vai usar!
 * @returns {Promise<string>} O token de acesso válido.
 */

export async function getAccessToken() {
    // Se já tivermos um token salvo, retorna ele
    if (_accessToken) {
        console.log('[SessionService] Retornando token do cache em memória.');
        return _accessToken;
    }

    // Caso não tenha em memória, busca um novo, armazena e retorna.
    console.log('[SessionService] Token não encontrado em cache. Buscando um novo...');
    return await revalidarToken();
}

/**
 * @description Força a busca por um novo token, o armazena e o retorna.
 * Esta função será chamada quando der os erros 401 (Unauthorized) ou 403 (Forbidden)
 * @returns {Promise<string>} O NOVO TOKEN DE ACESSO.
 */

export async function revalidarToken() {
    try {
        console.log('[SessionService] Forçando revalidação do token...');
        const novoToken = await buscarNovoTokenDaAPI(); // Função que faz a lógica de busca

        if (!novoToken) {
            throw new Error('A busca por um novo token retornou um valor vazio.');
        }

        // Armazena o novo Token na variável privada "_accessToken"
        _accessToken = novoToken;
        console.log('[SessionService] Novo token armazenado com sucesso!');

        return _accessToken;
    } catch (error) {
        console.log('❌ FALHA CRÍTICA ao revalidar o token de acesso:', error);
        // Se não conseguirmos um novo token, a aplicação pode continuar.
        // Limpamos o token antigo para forçar uma nova tentativa da próxima vez.
        _accessToken = null;
        // Propaga o erro para que a função que chamou saiba que a revalidação falhou.
        throw error;
    }
}