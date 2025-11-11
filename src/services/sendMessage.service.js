import axios from 'axios';
import { config, configDotenv } from 'dotenv';
import { text } from 'express';
configDotenv();

// Anchors:
// - Antes da primeira linha do arquivo adicione: `import axios from "axios";` (se usar ESM) ou `const axios = require("axios");` (CommonJS).
// - Substitui integralmente o trecho antigo do "const api = axios.create(...)" e da função "sendMessage".

// 👉 Config principal
const EVO_BASE_URL = process.env.EVO_BASE_URL || "";
const EVO_API_KEY = (process.env.EVO_API_KEY || "").trim(); // remove espaços acidentais

// ⚠️ EvolutionAPI usa header "apikey" (minúsculo)
const api = axios.create({
    baseURL: EVO_BASE_URL,
    headers: { apikey: EVO_API_KEY },
    timeout: 10000 // 10s
});

// Logger simples e seguro (sem vazar segredos)
function logInfo(event, payload = {}) {
    console.log(JSON.stringify({ level: "info", ts: new Date().toISOString(), event, ...payload }));
}
function logError(event, payload = {}) {
    console.error(JSON.stringify({ level: "error", ts: new Date().toISOString(), event, ...payload }));
}

// Sanitiza e valida número (E.164-like: só dígitos, exige DDI+DDD, mínimo 10 dígitos)
function sanitizeNumber(input) {
    const digits = String(input || "").replace(/\D/g, "");
    if (digits.length < 10) {
        throw new Error(`Número inválido: "${input}" -> "${digits}" (mínimo 10 dígitos com DDI+DDD)`);
    }
    return digits;
}

// Retry com backoff exponencial (sem lib externa)
async function withRetry(fn, { retries = 3, baseDelayMs = 400 }) {
    let attempt = 0;
    let lastErr;
    while (attempt <= retries) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            const status = err?.response?.status;
            const retryable =
                // timeouts, resets, DNS, etc.
                err.code === "ECONNABORTED" ||
                err.code === "ENOTFOUND" ||
                err.code === "ECONNRESET" ||
                // 5xx do servidor
                (typeof status === "number" && status >= 500 && status < 600) ||
                // 429 rate limit
                status === 429;

            if (!retryable || attempt === retries) break;

            const delay = Math.round(baseDelayMs * Math.pow(2, attempt) + Math.random() * 100);
            logInfo("retry_scheduled", { attempt: attempt + 1, delay_ms: delay, status });
            await new Promise(r => setTimeout(r, delay));
            attempt++;
        }
    }
    throw lastErr;
}

/**
 * Envia texto via EvolutionAPI
 * @param {Object} params
 * @param {string|number} params.number - número com DDI+DDD (apenas dígitos ou formatado; será sanitizado)
 * @param {string} params.text - conteúdo da mensagem
 * @param {string} [params.instance="meu-whats"] - nome da instância
 * @param {boolean} [params.linkPreview=false] - preview de links
 * @param {string} [params.idempotencyKey] - força idempotência no backend (se suportado)
 */
async function sendMessage({ number, text, instance = "meu-whats", linkPreview = false, idempotencyKey }) {
    const to = sanitizeNumber(number);
    const body = { number: to, text: String(text ?? ""), linkPreview: Boolean(linkPreview) };

    if (!body.text.trim()) throw new Error("Texto vazio.");

    const url = `/message/sendText/${encodeURIComponent(instance)}`;
    const headers = {};
    if (idempotencyKey) headers["x-idempotency-key"] = String(idempotencyKey);

    const start = Date.now();

    try {
        const resp = await withRetry(
            () => api.post(url, body, { headers }),
            { retries: 3, baseDelayMs: 400 }
        );

        const elapsedMs = Date.now() - start;
        const data = resp?.data || {};

        // tente extrair alguns campos comuns
        const messageId = data?.messageId || data?.id || null;
        const messageStatus = data?.status || data?.message?.status || "UNKNOWN";

        logInfo("send_text_success", {
            to,
            instance,
            http_status: resp.status,
            message_status: messageStatus,
            message_id: messageId,
            elapsed_ms: elapsedMs
        });

        return { ok: true, status: resp.status, data };
    } catch (err) {
        const elapsedMs = Date.now() - start;
        const status = err?.response?.status ?? null;

        // captura payload de erro sem vazar cabeçalhos sensíveis
        let responseData = null;
        try {
            responseData = err?.response?.data ?? null;
        } catch {
            responseData = null;
        }

        logError("send_text_error", {
            to,
            instance,
            http_status: status,
            code: err?.code || null,
            elapsed_ms: elapsedMs,
            response: responseData
        });

        // reempacota com mensagem amigável
        const friendly = new Error(
            status
                ? `Falha ao enviar (HTTP ${status}). Verifique número/instância/cotas.`
                : `Falha ao enviar (erro de rede/timeout).`
        );
        friendly.cause = err;
        throw friendly;
    }
}

// Exemplo de uso controlado (não executar em produção sem condicionar):
// (async () => {
//   try {
//     const res = await sendMessage({ number: "55 11 99999-9999", text: "Olá via EvolutionAPI!" });
//     console.log("OK:", res.status);
//   } catch (e) {
//     console.error("ERRO:", e.message);
//   }
// })();

export { sendMessage };