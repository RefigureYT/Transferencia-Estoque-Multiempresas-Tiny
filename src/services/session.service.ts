// ###   ./src/services/session.service.ts   ###

import { buscarNovoTokenDaAPI } from "./tinyApi.service.js";
import { listaEmpresasDefinidas, sendMessageMain } from "../main.js";

// ======================= TIPOS (mínimos) =======================

type TokenRow = { access_token: string } & Record<string, unknown>;

type EmpresaDefinidaMin = {
    empresa: string;
    tokenQuery: string | null;
    accessToken: string | null;
};

// ======================= ESTADO INTERNO =======================

let _accessToken: TokenRow[] | null = null;
let _listaTokensEmpresa: EmpresaDefinidaMin[] = [];

/**
 * @description Obtém o token de acesso atual. Se não houver um, busca um novo.
 * Esta é a principal função que 99% da aplicação vai usar!
 * @returns {Promise<string>} O token de acesso válido.
 */
export async function getAccessToken(empresa: string): Promise<string | undefined> {
    _listaTokensEmpresa = (listaEmpresasDefinidas ?? []) as unknown as EmpresaDefinidaMin[];

    // Verifica se o valor já existe dentro de _listaTokensEmpresa
    const listaEmpresaRecebida = _listaTokensEmpresa.find((v) => v.empresa === empresa);

    if (!listaEmpresaRecebida) return undefined;

    if (listaEmpresaRecebida.accessToken !== null) {
        // console.log('[SessionService] Retornando token do cache em memória.');
        return listaEmpresaRecebida.accessToken;
    }

    console.log("[SessionService] Token não encontrado em cache. Buscando um novo...");
    const token = await revalidarToken(listaEmpresaRecebida.tokenQuery); // Busca chave de api

    // Mantém exatamente sua lógica: token[0].access_token
    listaEmpresaRecebida.accessToken = token[0].access_token;

    return listaEmpresaRecebida.accessToken;
}

/**
 * @description Força a busca por um novo token, o armazena e o retorna.
 * Esta função será chamada quando der os erros 401 (Unauthorized) ou 403 (Forbidden)
 * @returns {Promise<string>} O NOVO TOKEN DE ACESSO.
 */
export async function revalidarToken(querySql: string | null): Promise<TokenRow[]> {
    try {
        console.log("[SessionService] Forçando revalidação do token...");
        const novoToken = (await buscarNovoTokenDaAPI(querySql)) as TokenRow[] | null | undefined;

        if (!novoToken) {
            throw new Error("A busca por um novo token retornou um valor vazio.");
        }
        if (!Array.isArray(novoToken) || !novoToken[0]?.access_token) {
            throw new Error("Formato de token inesperado: esperado array com { access_token }.");
        }

        // Armazena o novo Token na variável privada "_accessToken"
        _accessToken = novoToken;
        console.log("[SessionService] Novo token armazenado com sucesso!");

        return _accessToken;
    } catch (err: unknown) {
        const error = err as { message?: string };

        console.log("❌ FALHA CRÍTICA ao revalidar o token de acesso:", err);
        await sendMessageMain(
            `❌ FALHA CRÍTICA ao revalidar o token de acesso: ${error?.message ?? String(err)}`
        );

        // Limpamos o token antigo para forçar uma nova tentativa da próxima vez.
        _accessToken = null;

        // Propaga o erro
        throw err;
    }
}
