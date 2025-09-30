import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import https from 'https';
import fs from 'fs';
import path from 'path';

puppeteer.use(StealthPlugin()); // Ativa o modo stealth

// Função auxiliar para fechar o navegador e limpar o arquivo temporário
async function _encerrarExecucao(browser, filePath) {
    if (browser) {
        try {
            await browser.close();
            console.log('🧯 Navegador Puppeteer fechado.');
        } catch (e) {
            console.error('❌ Erro ao fechar o navegador:', e.message);
        }
    }

    // Não removemos mais o arquivo temporário aqui, pois o outputPath é o destino final
    // A limpeza de arquivos antigos é feita antes do download na função principal.
}

// Função auxiliar só para caçar o caminho do Chrome
function resolveChromePath() {
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        return process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    const candidates = [
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium',
    ];
    return candidates.find(p => fs.existsSync(p));
}

/**
 * Realiza o login no Tiny ERP e baixa a planilha de inventário de um depósito específico.
 * Antes de baixar, limpa arquivos de planilha existentes no diretório de destino.
 * @param {string} user - O nome de usuário para login no Tiny ERP.
 * @param {string} pass - A senha para login no Tiny ERP.
 * @param {string} idDeposito - O ID do depósito para o qual o relatório será baixado.
 * @param {string} outputPath - O caminho completo, incluindo o nome do arquivo, onde a planilha será salva.
 * @returns {Promise<string>} O caminho completo para o arquivo baixado.
 */
export async function baixarPlanilhaDeposito(user, pass, idDeposito, outputPath) {
    let browser = null;
    // Garante que outputPath é um caminho de arquivo absoluto
    const downloadFilePath = path.resolve(outputPath);

    // Verifica se o diretório de destino existe, se não, cria-o
    const outputDir = path.dirname(downloadFilePath);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    try {
        console.log('🚀 Iniciando processo de login...');

        const executablePath = resolveChromePath();
        if (!executablePath) {
            throw new Error('Chrome/Chromium não encontrado. Defina PUPPETEER_EXECUTABLE_PATH ou instale o navegador.');
        }

        browser = await puppeteer.launch({
            headless: 'false',
            executablePath,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-gpu',
                '--disable-dev-shm-usage',
                '--window-size=1366,768'
            ], // Compatibilidade com Linux
            defaultViewport: { width: 1366, height: 768 }
        });

        const page = await browser.newPage();
        console.log('🌐 Acessando o site do Tiny...');
        await page.goto('https://erp.tiny.com.br/login', { waitUntil: 'networkidle2' });

        console.log('📝 Preenchendo campo de usuário...');
        await page.waitForSelector('#username');
        await page.click('#username');
        await page.keyboard.type(user, { delay: 100 });
        await new Promise(resolve => setTimeout(resolve, 1000));

        // procura um <button> que tenha o texto "Avançar"
        console.log('➡️ Clicando no botão "Avançar"...');
        await page.evaluate(() => {
            const btn = document.querySelector(
                '#kc-content-wrapper > react-login-wc > section > div > main > aside.sc-jsJBEP.hfxeyl > div > button'
            );
            if (btn) btn.click();
        });
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log('🔒 Preenchendo a senha...');
        await page.waitForSelector('#password', { timeout: 10000 });
        await page.click('#password');
        await page.keyboard.type(pass, { delay: 100 });
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log('🔓 Clicando no botão "Entrar"...');
        await page.evaluate(() => {
            const btn = document.querySelector(
                '#kc-content-wrapper > react-login-wc > section > div > main > aside.sc-jsJBEP.hfxeyl > div > form > button'
            );
            if (btn) btn.click();
        });
        await new Promise(resolve => setTimeout(resolve, 5000)); // Aguarda possíveis modais

        console.log('🕵️ Verificando se há sessão ativa anterior...');
        const modalBtn = await page.$(
            '#bs-modal-ui-popup > div > div > div > div.modal-footer > button.btn-primary'
        );
        if (modalBtn) {
            console.log('⚠️ Sessão anterior detectada! Clicando em "Entrar assim mesmo"...');
            await modalBtn.click();
            await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
            console.log('✅ Nenhuma sessão anterior detectada.');
        }

        console.log('🍪 Extraindo cookies da sessão...');
        const cookies = await page.cookies();
        const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

        // Constrói a URL de download com base no idDeposito
        const downloadUrl = `https://erp.tiny.com.br/relatorios/relatorio.estoque.inventario.download.xls?produto=&idDeposito=${idDeposito}&idCategoria=0&descricaoCategoria=&exibirSaldo=&idCategoriaFiltro=0&layoutExportacao=R&formatoPlanilha=xls&exibirEstoqueDisponivel=N&produtoSituacao=A&idFornecedor=0&valorBaseado=0`;

        console.log(`⬇️ Iniciando download do relatório de ${idDeposito}...`);
        const fileStream = fs.createWriteStream(downloadFilePath);

        await new Promise((resolve, reject) => {
            const options = {
                headers: {
                    Cookie: cookieHeader,
                    'User-Agent': 'Mozilla/5.0'
                },
                timeout: 600000 // Aumentado para 10 minutos (600 segundos) para o download
            };

            const request = https.get(downloadUrl, options, (response) => {
                if (response.statusCode !== 200) {
                    return reject(new Error(`Falha no download: Código de status ${response.statusCode}`));
                }

                response.pipe(fileStream);
                fileStream.on('finish', () => {
                    fileStream.close();
                    console.log('✅ Download concluído com sucesso!');
                    resolve();
                });

                fileStream.on('error', (err) => {
                    console.error('❌ Erro ao escrever o arquivo:', err);
                    reject(new Error('Erro ao salvar o arquivo.'));
                });
            });

            request.on('timeout', () => {
                request.destroy(); // Aborta a requisição
                reject(new Error('Timeout de download atingido. A operação demorou muito.'));
            });

            request.on('error', (err) => {
                console.error('❌ Erro na requisição HTTPS:', err);
                reject(new Error('Erro na requisição de download.'));
            });
        });

        return downloadFilePath; // Retorna o caminho do arquivo baixado

    } catch (err) {
        console.error('❌ Erro na execução da automação:', err.message);
        throw err;
    } finally {
        await _encerrarExecucao(browser, downloadFilePath);
    }
}

/**
 * Remove arquivos com extensões específicas de um diretório.
 * @param {string} dirPath - Caminho do diretório
 * @param {string[]} allowedExtensions - Lista de extensões a apagar (ex.: ['.csv', '.xlsx'])
 */
export function limparArquivosPorExtensao(dirPath, allowedExtensions) {
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
        } catch (err) {
            console.error(`❌ Erro ao processar ${file}:`, err.message);
        }
    }
}