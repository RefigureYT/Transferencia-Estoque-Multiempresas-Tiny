// ### ./src/automations/puppeteer-api.ts ###

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import type { Browser, Protocol } from "puppeteer";

// Se o pacote não tipa `.use()` e `.launch()` corretamente, o cast resolve.
const puppeteerExtra = puppeteer as unknown as {
    use: (plugin: unknown) => void;
    launch: (opts: Record<string, unknown>) => Promise<Browser>;
};

puppeteerExtra.use(StealthPlugin()); // Ativa o modo stealth

// Função auxiliar para fechar o navegador
async function _encerrarExecucao(browser: Browser | null): Promise<void> {
    if (browser) {
        try {
            await browser.close();
            console.log("🧯 Navegador Puppeteer fechado.");
        } catch (e: unknown) {
            const err = e as { message?: string };
            console.error("❌ Erro ao fechar o navegador:", err?.message ?? String(e));
        }
    }
}

/**
 * Remove arquivos com extensões específicas de um diretório.
 * @param dirPath - Caminho do diretório
 * @param allowedExtensions - Lista de extensões a apagar (ex.: ['.csv', '.xlsx'])
 */
export function limparArquivosPorExtensao(dirPath: string, allowedExtensions: string[]): void {
    if (!fs.existsSync(dirPath)) {
        console.warn(`⚠️ Diretório não existe: ${dirPath}`);
        return;
    }

    const files = fs.readdirSync(dirPath);
    for (const file of files) {
        const filePath = path.join(dirPath, file);

        try {
            if (fs.lstatSync(filePath).isFile()) {
                const ext = path.extname(file).toLowerCase();
                if (allowedExtensions.includes(ext)) {
                    fs.unlinkSync(filePath);
                    console.log(`🗑️ Removido: ${file}`);
                }
            }
        } catch (e: unknown) {
            const err = e as { message?: string };
            console.error(`❌ Erro ao processar ${file}:`, err?.message ?? String(e));
        }
    }
}

/**
 * Realiza o login no Tiny ERP e baixa a planilha de inventário de um depósito específico.
 * Antes de baixar, limpa arquivos de planilha existentes no diretório de destino.
 * @returns O caminho completo para o arquivo baixado.
 */
export async function baixarPlanilhaDeposito(
    user: string,
    pass: string,
    idDeposito: string | number,
    outputPath: string
): Promise<string> {
    let browser: Browser | null = null;

    // Garante que outputPath é um caminho de arquivo absoluto
    const downloadFilePath = path.resolve(outputPath);

    // Verifica se o diretório de destino existe, se não, cria-o
    const outputDir = path.dirname(downloadFilePath);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Limpa arquivos de planilha existentes no diretório de destino
    const spreadsheetExtensions = [".csv", ".xls", ".xlsx", ".ods", ".fods", ".tsv"];
    if (fs.existsSync(outputDir)) {
        const filesInDir = fs.readdirSync(outputDir);
        for (const file of filesInDir) {
            const filePath = path.join(outputDir, file);
            if (fs.lstatSync(filePath).isFile()) {
                const ext = path.extname(file).toLowerCase();
                if (spreadsheetExtensions.includes(ext)) {
                    try {
                        fs.unlinkSync(filePath);
                        console.log(`🗑️ Arquivo de planilha antigo removido: ${file}`);
                    } catch (e: unknown) {
                        const err = e as { message?: string };
                        console.error(`❌ Erro ao remover arquivo de planilha antigo ${file}:`, err?.message ?? String(e));
                    }
                }
            }
        }
    }

    try {
        console.log("🚀 Iniciando processo de login...");
        browser = await puppeteerExtra.launch({
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--single-process",
                "--no-zygote",
            ],
        });

        const page = await browser.newPage();
        console.log("🌐 Acessando o site do Tiny...");
        await page.goto("https://erp.tiny.com.br/login", { waitUntil: "networkidle2" });

        console.log("📝 Preenchendo campo de usuário...");
        await page.waitForSelector("#username");
        await page.click("#username");
        await page.keyboard.type(user, { delay: 100 });
        await new Promise<void>((resolve) => setTimeout(resolve, 1000));

        console.log('➡️ Clicando no botão "Avançar"...');
        await page.evaluate(() => {
            const btn = document.querySelector("#input-wrapper > button") as HTMLElement | null;
            if (btn) btn.click();
        });
        await new Promise<void>((resolve) => setTimeout(resolve, 1000));

        console.log("🔒 Preenchendo a senha...");
        await page.waitForSelector("#password", { timeout: 10_000 });
        await page.click("#password");
        await page.keyboard.type(pass, { delay: 100 });
        await new Promise<void>((resolve) => setTimeout(resolve, 1000));

        console.log('🔓 Clicando no botão "Entrar"...');
        await page.evaluate(() => {
            const btn = document.querySelector("#input-wrapper > button") as HTMLElement | null;
            if (btn) btn.click();
        });
        await new Promise<void>((resolve) => setTimeout(resolve, 5000));

        console.log("🕵️ Verificando se há sessão ativa anterior...");
        const modalBtn = await page.$("#bs-modal-ui-popup > div > div > div > div.modal-footer > button.btn-primary");
        if (modalBtn) {
            console.log('⚠️ Sessão anterior detectada! Clicando em "Entrar assim mesmo"...');
            await modalBtn.click();
            await new Promise<void>((resolve) => setTimeout(resolve, 2000));
        } else {
            console.log("✅ Nenhuma sessão anterior detectada.");
        }

        console.log("🍪 Extraindo cookies da sessão...");
        const cookies = (await page.cookies()) as Protocol.Network.Cookie[];
        const cookieHeader = cookies.map((c: Protocol.Network.Cookie) => `${c.name}=${c.value}`).join("; ");

        const downloadUrl =
            `https://erp.tiny.com.br/relatorios/relatorio.estoque.inventario.download.xls` +
            `?produto=&idDeposito=${encodeURIComponent(String(idDeposito))}` +
            `&idCategoria=0&descricaoCategoria=&exibirSaldo=&idCategoriaFiltro=0&layoutExportacao=R&formatoPlanilha=xls` +
            `&exibirEstoqueDisponivel=N&produtoSituacao=A&idFornecedor=0&valorBaseado=0`;

        console.log(`⬇️ Iniciando download do relatório de ${idDeposito}...`);
        const fileStream = fs.createWriteStream(downloadFilePath);

        await new Promise<void>((resolve, reject) => {
            const options: https.RequestOptions = {
                headers: {
                    Cookie: cookieHeader,
                    "User-Agent": "Mozilla/5.0",
                },
                timeout: 150_000,
            };

            const request = https.get(downloadUrl, options, (response) => {
                if (response.statusCode !== 200) {
                    response.resume();
                    return reject(new Error(`Falha no download: Código de status ${response.statusCode}`));
                }

                response.pipe(fileStream);

                fileStream.on("finish", () => {
                    fileStream.close();
                    console.log("✅ Download concluído com sucesso!");
                    resolve();
                });

                fileStream.on("error", (err) => {
                    console.error("❌ Erro ao escrever o arquivo:", err);
                    reject(new Error("Erro ao salvar o arquivo."));
                });
            });

            request.on("timeout", () => {
                request.destroy();
                reject(new Error("Timeout de download atingido. A operação demorou muito."));
            });

            request.on("error", (err) => {
                console.error("❌ Erro na requisição HTTPS:", err);
                reject(new Error("Erro na requisição de download."));
            });
        });

        return downloadFilePath;
    } catch (e: unknown) {
        const err = e as { message?: string };
        console.error("❌ Erro na execução da automação:", err?.message ?? String(e));
        throw e;
    } finally {
        await _encerrarExecucao(browser);
    }
}
