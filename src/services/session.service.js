// ###   ./src/services/session.service.js   ###
import { buscarNovoTokenDaAPI } from './tinyApi.service.js';
import { listaEmpresasDefinidas } from '../main.js';

let _accessToken = null;
let _listaTokensEmpresa = [];

/**
 * @description Obtém o token de acesso atual. Se não houver um, busca um novo.
 * Esta é a principal função que 99% da aplicação vai usar!
 * @returns {Promise<string>} O token de acesso válido.
 */

export async function getAccessToken(empresa) {
    _listaTokensEmpresa = listaEmpresasDefinidas;

    // Verifica se o valor já existe dentro de _listaTokensEmpresa
    const listaEmpresaRecebida = _listaTokensEmpresa.find(v => v.empresa === empresa);

    if (listaEmpresaRecebida) {
        if (listaEmpresaRecebida.accessToken !== null) {
            // console.log('[SessionService] Retornando token do cache em memória.');
            return listaEmpresaRecebida.accessToken;
        } else {
            console.log('[SessionService] Token não encontrado em cache. Buscando um novo...');
            const token = await revalidarToken(listaEmpresaRecebida.tokenQuery); // Busca chave de api
            listaEmpresaRecebida.accessToken = token[0].access_token; // adiciona à memória (lista)

            return listaEmpresaRecebida.accessToken; // Retorna a chave de api que está na memória (lista)
        }
    }
}

/**
 * @description Força a busca por um novo token, o armazena e o retorna.
 * Esta função será chamada quando der os erros 401 (Unauthorized) ou 403 (Forbidden)
 * @returns {Promise<string>} O NOVO TOKEN DE ACESSO.
 */

export async function revalidarToken(querySql) {
    try {
        console.log('[SessionService] Forçando revalidação do token...');
        const novoToken = await buscarNovoTokenDaAPI(querySql); // Função que faz a lógica de busca

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