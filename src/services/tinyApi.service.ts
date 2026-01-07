// ###   ./src/services/tinyApi.service.ts   ###

// IMPORTS
import axios, { type AxiosError } from "axios";
import { DateTime } from "luxon";

import { executarQueryInDb } from "./database.service.js";
import { listaEmpresasDefinidas } from "../main.js";
import { revalidarToken } from "./session.service.js";
import { sendMessageMain } from "../main.js";

const _url = "https://api.tiny.com.br/public-api/v3"; // UrlTinyDefault

/**
 * Função auxiliar para criar um atraso (delay).
 * @param ms - O tempo de espera em milissegundos.
 */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

type EmpresaTinyMin = {
  empresa: string;
  nomeEmpresa: string;
  accessToken: string | null;
  tokenQuery: string | null;
};

type TinyApiErrorContext = {
  status: number | string;
  url: string;
  method: "GET" | "POST";
  requestData?: unknown;
  responseData?: unknown;
  headers?: Record<string, unknown>;
};

export class TinyApiError extends Error {
  status: number | string;
  url: string;
  method: string;
  requestData?: unknown;
  responseData?: unknown;
  headers?: Record<string, unknown>;

  constructor(message: string, { status, url, method, requestData, responseData, headers }: TinyApiErrorContext) {
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

export async function buscarNovoTokenDaAPI(querySql: string | null): Promise<Array<Record<string, unknown>>> {
  const resultado = await executarQueryInDb<Record<string, unknown>>(String(querySql ?? ""), []);
  return resultado;
}

type ProdTinyResponse = {
  itens?: Array<{ id?: string | number; descricao?: string } & Record<string, unknown>>;
} & Record<string, unknown>;

/**
 * @description Busca um produto na API da Tiny com retentativas (401/403 revalida token, 429 backoff).
 */
export async function getProdTiny(
  typeQuery: string,
  query: string | number,
  empresa: string,
  situacao: string = "A"
): Promise<unknown> {
  const empresaTiny = (listaEmpresasDefinidas as unknown as EmpresaTinyMin[]).find(
    (v) => v.empresa === empresa || v.nomeEmpresa.includes(empresa)
  );

  if (!empresaTiny) {
    console.error(`❌ Empresa "${empresa}" não encontrada na lista de configurações.`);
    await sendMessageMain(`❌ Empresa "${empresa}" não encontrada na lista de configurações.`);
    process.exit(1);
  }

  const temposDeEspera = [10, 20, 40, 60, 120]; // segundos
  const maxTentativas = temposDeEspera.length;

  for (let tentativa = 0; tentativa < maxTentativas; tentativa++) {
    try {
      const auth = `Bearer ${empresaTiny.accessToken}`;
      const config = { headers: { Authorization: auth } };

      const _urlMontada = `${_url}/produtos?${typeQuery}=${query}&situacao=${situacao}`;

      if (tentativa > 2) {
        console.log(`[Tentativa ${tentativa + 1}/${maxTentativas}] Buscando produto para a empresa ${empresa}...`);
      }

      const response = await axios.get(_urlMontada, config);
      return response.data;
    } catch (err: unknown) {
      const e = err as AxiosError;

      if (!e.response) {
        console.error("❌ Erro de rede ou inesperado:", (e as any)?.message);
        await sendMessageMain(`❌ Erro de rede ou inesperado: ${(e as any)?.message ?? String(err)}`);
        throw err;
      }

      const status = e.response.status;

      if (status === 401 || status === 403) {
        console.warn(`[API] Token inválido/expirado (Erro ${status}). Tentando revalidar...`);
        console.log("Tentando buscar outro token...");
        await revalidarToken(empresaTiny.tokenQuery);
        continue;
      }

      if (status === 429) {
        const tempoEsperaSegundos = temposDeEspera[tentativa];
        console.warn(`[Erro ${status}] Too Many Requests. A API está sobrecarregada.`);

        if (tentativa < maxTentativas - 1) {
          console.log(`Aguardando ${tempoEsperaSegundos} segundos antes de tentar novamente...`);
          await sleep(tempoEsperaSegundos * 1000);
        } else {
          console.error(
            `❌ FALHA: A API continuou retornando 'Too Many Requests' após ${maxTentativas} tentativas.`
          );
          await sendMessageMain(
            `❌ FALHA: A API continuou retornando 'Too Many Requests' após ${maxTentativas} tentativas.`
          );
          throw new Error(`API sobrecarregada. Falha após ${maxTentativas} tentativas.`);
        }
        continue;
      }

      if (status === 404) {
        console.error("[❌ ERRO - tinyApi.service.ts] Não foi encontrado o cadastro deste produto.");
        return [];
      }

      throw new TinyApiError(`❌ Erro de API não tratável ao buscar produto na empresa ${empresa}.`, {
        status: status ?? "SEM_STATUS",
        url: `${_url}/produtos?${encodeURIComponent(typeQuery)}=${encodeURIComponent(String(query))}&situacao=${encodeURIComponent(
          String(situacao)
        )}`,
        method: "GET",
        requestData: undefined,
        responseData: e?.response?.data,
        headers: { Authorization: "***TOKEN_MASCARADO***" },
      });
    }
  }

  // (inacessível na prática)
  return [];
}

/**
 * @description Movimenta estoque (POST /estoque/{idProd}) com fallback 401/403 e 429.
 */
export async function editEstoqueProdTiny(
  fromEmpresa: string,
  idProd: string | number,
  tipoMovimento: string,
  qtdProd: number | string,
  idEstoque: string | number,
  toEmpresa: string,
  precoUnitario: number | string = 0
): Promise<unknown> {
  const empresaTiny = (listaEmpresasDefinidas as unknown as EmpresaTinyMin[]).find(
    (v) => v.empresa === fromEmpresa || v.nomeEmpresa.includes(fromEmpresa)
  );

  if (!empresaTiny) {
    console.error(`❌ Empresa "${fromEmpresa}" não encontrada na lista de configurações.`);
    await sendMessageMain(`❌ Empresa "${fromEmpresa}" não encontrada na lista de configurações.`);
    process.exit(1);
  }

  const temposDeEspera = [10, 20, 40, 60, 120]; // segundos
  const maxTentativas = temposDeEspera.length;

  for (let tentativa = 0; tentativa < maxTentativas; tentativa++) {
    // declara fora do try para reaproveitar no catch (como no seu JS)
    let data: Record<string, unknown> | undefined;

    try {
      const auth = `Bearer ${empresaTiny.accessToken}`;
      const config = { headers: { Authorization: auth } };
      const _urlMontada = `${_url}/estoque/${idProd}`;

      // Captura DATA (tempo)
      const now = DateTime.now().setZone("America/Sao_Paulo");
      const dataFormatada = now.toFormat("yyyy-LL-dd HH:mm:ss");

      const tm = String(tipoMovimento).toUpperCase();
      const setaMovimentacao = tm === "E" ? "<-" : tm === "S" ? "->" : "-";

      data = {
        deposito: {
          id: parseInt(String(idEstoque), 10),
        },
        tipo: tm,
        data: dataFormatada,
        quantidade: parseInt(String(qtdProd), 10),
        precoUnitario: parseInt(String(precoUnitario), 10),
        observacoes: `Transferência entre empresas | ${fromEmpresa} ${setaMovimentacao} ${toEmpresa} | Script Kelvin`,
      };

      if (tentativa > 2) {
        console.log(
          `[Tentativa ${tentativa + 1}/${maxTentativas}] Alterando estoque para a empresa ${fromEmpresa}...`
        );
      }

      const response = await axios.post(_urlMontada, data, config);

      console.log(`✅ Sucesso! Estoque alterado para a empresa ${fromEmpresa}.`);
      return response.data;
    } catch (err: unknown) {
      const e = err as AxiosError;

      if (!e.response) {
        console.error("❌ Erro de rede ou inesperado:", (e as any)?.message);
        await sendMessageMain(`❌ Erro de rede ou inesperado: ${(e as any)?.message ?? String(err)}`);
        throw err;
      }

      const status = e.response.status;

      if (status === 401 || status === 403) {
        console.warn(`[API] Token inválido/expirado (Erro ${status}). Tentando revalidar...`);
        console.log("Tentando buscar outro token...");

        await revalidarToken(empresaTiny.tokenQuery);

        console.log("Erro recebido:", (e as any)?.message);
        continue;
      }

      if (status === 429) {
        const tempoEsperaSegundos = temposDeEspera[tentativa];
        console.warn(`[Erro ${status}] Too Many Requests. A API está sobrecarregada.`);

        if (tentativa < maxTentativas - 1) {
          console.log(`Aguardando ${tempoEsperaSegundos} segundos antes de tentar novamente...`);
          await sleep(tempoEsperaSegundos * 1000);
        } else {
          console.error(
            `❌ FALHA: A API continuou retornando 'Too Many Requests' após ${maxTentativas} tentativas.`
          );
          await sendMessageMain(
            `❌ FALHA: A API continuou retornando 'Too Many Requests' após ${maxTentativas} tentativas.`
          );
          throw new Error(`API sobrecarregada. Falha após ${maxTentativas} tentativas.`);
        }
        continue;
      }

      throw new TinyApiError(`❌ Erro de API não tratável ao editar estoque (empresa ${fromEmpresa}).`, {
        status: status ?? "SEM_STATUS",
        url: `${_url}/estoque/${idProd}`,
        method: "POST",
        requestData: data,
        responseData: e?.response?.data,
        headers: { Authorization: "***TOKEN_MASCARADO***" },
      });
    }
  }

  // (inacessível na prática)
  return {};
}

type EstoqueDeposito = {
  id: string | number;
  nome?: string | null;
  desconsiderar?: boolean | null;
} & Record<string, unknown>;

type EstoqueProdResponse = {
  depositos?: EstoqueDeposito[];
} & Record<string, unknown>;

export async function getEstoqueProdTiny(empresa: string): Promise<EstoqueProdResponse | unknown[]> {
  const empresaTiny = (listaEmpresasDefinidas as unknown as EmpresaTinyMin[]).find(
    (v) => v.empresa === empresa || v.nomeEmpresa.includes(empresa)
  );

  if (!empresaTiny) {
    console.error(`❌ Empresa "${empresa}" não encontrada na lista de configurações.`);
    await sendMessageMain(`❌ Empresa "${empresa}" não encontrada na lista de configurações.`);
    process.exit(1);
  }

  const temposDeEspera = [10, 20, 40, 60, 120]; // segundos
  const maxTentativas = temposDeEspera.length;

  for (let tentativa = 0; tentativa < maxTentativas; tentativa++) {
    try {
      const prod = (await getProdTiny("limit", "1", empresa)) as ProdTinyResponse;

      const first = Array.isArray(prod?.itens) && prod.itens.length ? prod.itens[0] : null;
      if (!first?.id) {
        console.error("❌ Nenhum produto retornado pela Tiny para inspeção de estoque.");
        await sendMessageMain("❌ Nenhum produto retornado pela Tiny para inspeção de estoque.");
        return [];
      }

      const idProd = first.id;

      const auth = `Bearer ${empresaTiny.accessToken}`;
      const config = { headers: { Authorization: auth } };
      const _urlMontada = `${_url}/estoque/${idProd}`;

      if (tentativa > 2) {
        console.log(`[Tentativa ${tentativa + 1}/${maxTentativas}] Buscando estoques para a empresa ${empresa}...`);
      }

      const response = await axios.get(_urlMontada, config);

      console.log(`✅ Sucesso! Depósitos encontrado para a empresa ${empresa}.`);
      return response.data as EstoqueProdResponse;
    } catch (err: unknown) {
      const e = err as AxiosError;

      if (!e.response) {
        console.error("❌ Erro de rede ou inesperado:", (e as any)?.message);
        await sendMessageMain(`❌ Erro de rede ou inesperado: ${(e as any)?.message ?? String(err)}`);
        throw err;
      }

      const status = e.response.status;

      if (status === 401 || status === 403) {
        console.warn(`[API] Token inválido/expirado (Erro ${status}). Tentando revalidar...`);
        console.log("Tentando buscar outro token...");

        await revalidarToken(empresaTiny.tokenQuery);
        continue;
      }

      if (status === 429) {
        const tempoEsperaSegundos = temposDeEspera[tentativa];
        console.warn(`[Erro ${status}] Too Many Requests. A API está sobrecarregada.`);

        if (tentativa < maxTentativas - 1) {
          console.log(`Aguardando ${tempoEsperaSegundos} segundos antes de tentar novamente...`);
          await sleep(tempoEsperaSegundos * 1000);
        } else {
          console.error(
            `❌ FALHA: A API continuou retornando 'Too Many Requests' após ${maxTentativas} tentativas.`
          );
          await sendMessageMain(
            `❌ FALHA: A API continuou retornando 'Too Many Requests' após ${maxTentativas} tentativas.`
          );
          throw new Error(`API sobrecarregada. Falha após ${maxTentativas} tentativas.`);
        }
        continue;
      }

      throw new TinyApiError(`❌ Erro de API não tratável ao buscar estoques.`, {
        status: status ?? "SEM_STATUS",
        url: `${_url}/estoque/${(e as any)?.config?.url ?? "URL_DESCONHECIDA"}`,
        method: "GET",
        requestData: undefined,
        responseData: e?.response?.data,
        headers: { Authorization: "***TOKEN_MASCARADO***" },
      });
    }
  }

  // (inacessível na prática)
  return [];
}
