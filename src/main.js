// ### ./src/main.js ###

// Importa as variáveis do .env
import dotenv from 'dotenv';
dotenv.config();

// ## index.js ##
import { logEnvVariables } from './config/index.js';
import { semDepositosEnv } from './config/index.js';
import { definirEmpresas } from './config/index.js';

// #### services ####
// ## tinyApi.service.js ##
import { editEstoqueProdTiny } from './services/tinyApi.service.js'
import { getProdTiny } from './services/tinyApi.service.js';

// ## sheet.service.js ##
import { filtrarPlanilha } from './services/sheet.service.js';

// ## session.service.js ##
import { getAccessToken } from './services/session.service.js';

// ## tinyPuppeteer.service.js ##
import { baixarPlanilhaDeposito } from './services/tinyPuppeteer.service.js';
import { limparArquivosPorExtensao } from './services/tinyPuppeteer.service.js';

// ## sendMessage.service.js ##
import { sendMessage } from './services/sendMessage.service.js';

// Imports adicionais
import { randomUUID } from "crypto";

// #### main.js ####
// Variáveis globais
export let listaEmpresasDefinidas = null;
export let instanceWhatsApp = [];
export let listaTelefones = [];

async function main() {
    // console.log('Lista de telefones antes do allValidations ->', listaTelefones); // TODO [DEBUG]
    await allValidations(); // Se passou dessa linha de código, sinal que está tudo certo para o script poder prosseguir sem maiores complicações

    // console.log('Lista de telefones depois do allValidations ->', listaTelefones); // TODO [DEBUG]
    // || ================ BAIXA A PLANILHA DE ESTOQUE ================ || \\
    const extensions = [".csv", ".xls", ".xlsx", ".ods", ".fods", ".tsv"]; 
    limparArquivosPorExtensao('./data', extensions); // Limpa todos as planilhas do diretório './data' 

    // Cria o objeto com o caminho das planilhas de acordo com a empresa definida no .env
    const objPathPlanilhas = {
        // LT: '/home/desenvolvedor/Desenvolvedores/kelvinho/Transferencia-Estoque-Multiempresas-Tiny/data/inventario-lt.xls',
        // JF: '/home/desenvolvedor/Desenvolvedores/kelvinho/Transferencia-Estoque-Multiempresas-Tiny/data/inventario-jf.xls'
    };

    // Baixa cada uma das planilhas de estoque (exceto da empresa principal)
    for (const empresa of listaEmpresasDefinidas) { 
        if (empresa.isMaster) continue; // Pula a empresa principal 
        const e = empresa; 
        const caminhoPlanilha = await baixarPlanilhaDeposito(e.userTiny, e.passTiny, e.idDeposito, `./data/inventario-${e.empresa.toLowerCase()}.xls`); 
        console.log(caminhoPlanilha); 
        objPathPlanilhas[e.empresa] = caminhoPlanilha; 
    } 

    console.log('=== PLANILHAS ===');
    console.log(objPathPlanilhas);
    console.log('==== [ END ] ====');

    for (const empresa of listaEmpresasDefinidas) { 
        if (empresa.isMaster) continue; // Pula a empresa principal 
        const filterMap = { 
            true_true: '!=0',  // pode positivos e negativos → diferente de zero 
            false_true: '<0',   // só negativos 
            true_false: '>0',   // só positivos 
            false_false: null   // nenhum → não faz nada 
        }; 

        if (filterMap[`${empresa.transfPositivo}_${empresa.transfNegativo}`] === null) { 
            console.log(`\n--- Nenhuma transferência configurada para a empresa ${empresa.nomeEmpresa}. Pulando. ---`); 
            continue; // Pula para a próxima empresa 
        } 

        const a = filtrarPlanilha(`./data/inventario-${empresa.empresa.toLowerCase()}.xls`, 'F', filterMap[`${empresa.transfPositivo}_${empresa.transfNegativo}`]); 
        // const b = a.filter(v => String(v.codigo_sku).trim().toUpperCase().includes("JP0173")); // -=- DEBUG -=-  

        const messageEstoque = filterMap[`${empresa.transfPositivo}_${empresa.transfNegativo}`] === '<0' ? 
            'menor que 0' : filterMap[`${empresa.transfPositivo}_${empresa.transfNegativo}`] === '>0' ? 
                'maior que 0' : 
                'diferente de 0'; 

        console.log(`Foram localizados ${a.length} produtos com o estoque ${messageEstoque} na empresa ${empresa.nomeEmpresa}`); 
        const objEmpresaMaster = listaEmpresasDefinidas.find(v => v.isMaster === true); 

        for (const p of a) { 
            // Existem casos (registrados por mim) que ocorreram de alguns produtos não terem SKU (praticamente impossível...)
            // Mas de qualquer forma, para isso não ocorrer (evitar a fadiga ksksks)
            // Coloquei esse if, caso ocorra de algum produto não ter "sku" ele apenas ignora que passa pro próximo
            if (!p.codigo_sku) continue; 
            const ok = await transfEstoque(p, empresa, objEmpresaMaster); 
            if (!ok) continue; // Se der algum erro só ignora e continua 
        } 
    } 

    await sendMessageMain(`✨ Processo concluído!
🎉 Todas as operações foram executadas com sucesso.
📊 Estoques atualizados e sincronizados.
🔒 Sistema encerrado com segurança.
Até a próxima execução! 👋`);

    console.log('\n✨ Processo concluído!');
    console.log('🎉 Todas as operações foram executadas com sucesso.');
    console.log('📊 Estoques atualizados e sincronizados.');
    console.log('🔒 Sistema encerrado com segurança.');
    console.log('Até a próxima execução! 👋\n');

    process.exit(0);
}

async function allValidations() {
    // Verifica se todas as variáveis foram preenchidas corretamente no .env
    const allVariables = await logEnvVariables();

    if (!allVariables) {
        console.error('❌ Erro: Falha na validação das variáveis de ambiente. Verifique o .env e tente novamente.');
        await sendMessageMain('❌ Erro: Falha na validação das variáveis de ambiente. Verifique o .env e tente novamente.');
        process.exit(1); // Sai do processo com código de erro
    }
    console.log('✅ Variáveis de ambiente validadas com sucesso. Iniciando o sistema...');

    // Define as empresas dentro da lista global com todas as variáveis do .env padronizadas corretamente
    listaEmpresasDefinidas = await definirEmpresas();

    // Captura o AccessToken do Tiny de cada uma das empresas com base no Query
    for (const empresa of listaEmpresasDefinidas) {
        await getAccessToken(empresa.empresa);
    }

    // Verifica se existe algum '_ID_DEPOSITO' dentro do .env que não está preenchido.
    const idDepositoVazio = listaEmpresasDefinidas.some(v => v.idDeposito === undefined || v.idDeposito === null || v.idDeposito === '');
    if (idDepositoVazio) { // Se tiver algum idDeposito faltando ele automaticamente busca todos os depósitos de cada uma das empresas mencionadas no .env
        await semDepositosEnv();  // E após buscar ele lista em formato de tabela e então encerra o script  (Não vai sair daqui a menos que o usuário preencha o .env com o idDeposito)
    }
}

async function transfEstoque(p, empresaFilial, objEmpresaMaster) {
    console.log(`\n--- Processando SKU: ${p.codigo_sku} | Estoque encontrado: ${p.estoque_atual} ---`);

    // 1. Validação inicial do estoque
    if (p.estoque_atual === 0) {
        console.log('[INFO] Estoque zerado. Nenhuma transferência necessária. Pulando.');
        return true; // Retorna 'true' para indicar sucesso (nenhuma ação necessária)
    }

    try {
        // ==================================================================
        // ETAPA 1: BUSCAR E VALIDAR PRODUTOS (LÓGICA CENTRALIZADA)
        // ==================================================================
        const resProdMaster = await getProdTiny('codigo', p.codigo_sku, objEmpresaMaster.empresa);
        const prodMaster = resProdMaster?.itens?.[0];
        if (!prodMaster) {
            console.error(`[❌ FALHA] Produto não encontrado na empresa principal [${objEmpresaMaster.nomeEmpresa}].`);
            return false; // Sinaliza falha para o loop externo
        }
        console.log(`[OK] Localizado na Master: ${prodMaster.descricao} (ID: ${prodMaster.id})`);

        const resProdFilial = await getProdTiny('codigo', p.codigo_sku, empresaFilial.empresa);
        const prodFilial = resProdFilial?.itens?.[0];
        if (!prodFilial) {
            console.error(`[❌ FALHA] Produto não encontrado na empresa filial [${empresaFilial.nomeEmpresa}].`);
            return false; // Sinaliza falha
        }
        console.log(`[OK] Localizado na Filial: ${prodFilial.descricao} (ID: ${prodFilial.id})`);

        // ==================================================================
        // ETAPA 2: EXECUTAR A TRANSFERÊNCIA (LÓGICA CONDICIONAL)
        // ==================================================================
        if (p.estoque_atual > 0) { // Estoque maior que 0
            // Fluxo: Estoque positivo na Filial. Transferir para a Master.
            // [-] FILIAL  -->  [+] MASTER
            console.log(`Iniciando transferência: ${p.estoque_atual} unidades da ${empresaFilial.empresa} para ${objEmpresaMaster.empresa}.`);

            // Saída da Filial
            await editEstoqueProdTiny(empresaFilial.empresa, prodFilial.id, 'S', p.estoque_atual, empresaFilial.idDeposito, objEmpresaMaster.empresa);

            // Entrada na Master
            await editEstoqueProdTiny(objEmpresaMaster.empresa, prodMaster.id, 'E', p.estoque_atual, objEmpresaMaster.idDeposito, empresaFilial.empresa);
        } else { // p.estoque_atual < 0
            // Fluxo: Estoque negativo na Filial. Cobrir com estoque da Master.
            // [-] MASTER  -->  [+] FILIAL

            const estoque_atual = p.estoque_atual * -1;
            console.log(`Iniciando transferência: ${estoque_atual} unidades da ${objEmpresaMaster.empresa} para ${empresaFilial.empresa}.`);

            // Saída da Master
            await editEstoqueProdTiny(objEmpresaMaster.empresa, prodMaster.id, 'S', estoque_atual, objEmpresaMaster.idDeposito, empresaFilial.empresa);

            // Entrada na Filial
            await editEstoqueProdTiny(empresaFilial.empresa, prodFilial.id, 'E', estoque_atual, empresaFilial.idDeposito, objEmpresaMaster.empresa);
        }
        console.log(`[✔️ SUCESSO!] Transferência do SKU ${p.codigo_sku} concluída.`);
        return true; // Sinaliza sucesso
    } catch (error) {
        // ==================================================================
        // ETAPA 3: CAPTURAR E TRATAR QUALQUER ERRO DA API
        // ==================================================================
        if (error.name === 'TinyApiError') {
            console.error(`❌ Falha de API ao processar o SKU: ${p.codigo_sku}.`);
            console.error(`   - Status: ${error.status}`);
            console.error(`   - URL: ${error.url}`);
            console.error(`   - Resposta da API: ${JSON.stringify(error.responseData)}`);

            if (error.status === 404) {
                console.warn(`   - Causa Provável: O ID de um produto ou depósito não foi encontrado durante a movimentação.`);
            }
            await sendMessageMain(`❌ Falha de API ao processar o SKU: ${p.codigo_sku}.
    - Causa Provável: O ID de um produto ou depósito não foi encontrado durante a movimentação.
    - Status: ${error.status}
    - URL: ${error.url}
    - Resposta da API: ${JSON.stringify(error.responseData)}`);
        } else {
            // Erro inesperado (não da API)
            console.error(`❌ Ocorreu um erro inesperado no processamento do SKU ${p.codigo_sku}:`, error.message);
            await sendMessageMain(`❌ Ocorreu um erro inesperado no processamento do SKU ${p.codigo_sku}: ${error.message}`);
        }

        console.warn("   ➡️  Ação: A transferência para este produto foi cancelada. Pulando para o próximo.");
        await sendMessageMain('➡️  Ação: A transferência para este produto foi cancelada. Pulando para o próximo.');
        return false; // Sinaliza falha para o loop externo
    }
}

export async function sendMessageMain(text, instance = instanceWhatsApp[0], linkPreview = false, idempotencyKey = randomUUID()) {
    if (listaTelefones.length === 0) return true; // Caso não tenha nenhum número para enviar a mensagem, apenas dê como concluído.

    for(const number of listaTelefones) {
        const obj = {
            number,
            text,
            instance,
            linkPreview,
            idempotencyKey
        };

        if(await sendMessage(obj)) return true;
        return false;
    }
}

// Outras lógicas de inicialização podem ser adicionadas aqui
main();