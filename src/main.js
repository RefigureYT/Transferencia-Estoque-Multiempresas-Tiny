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

// #### main.js ####
// Variáveis globais
export let listaEmpresasDefinidas = null;

async function main() {
    await allValidations(); // Se passou dessa linha de código, sinal que está tudo certo para o script poder prosseguir sem maiores complicações    

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
        const a = filtrarPlanilha(`./data/inventario-${empresa.empresa.toLowerCase()}.xls`, 'F', '!=0');
        // const b = a.filter(v => String(v.codigo_sku).trim().toUpperCase().includes("JP0173")); // -=- DEBUG -=-

        console.log(`Foram localizados ${a.length} produtos com o estoque diferente de 0 na empresa ${empresa.nomeEmpresa}`);
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
        process.exit(1); // Sai do processo com código de erro
    }
    console.log('✅ Variáveis de ambiente validadas com sucesso. Iniciando o sistema...');

    // Define as empresas dentro da lista global com todas as variáveis do .env padronizadas corretamente
    listaEmpresasDefinidas = definirEmpresas();

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
        } else {
            // Erro inesperado (não da API)
            console.error(`❌ Ocorreu um erro inesperado no processamento do SKU ${p.codigo_sku}:`, error.message);
        }

        console.warn("   ➡️  Ação: A transferência para este produto foi cancelada. Pulando para o próximo.");
        return false; // Sinaliza falha para o loop externo
    }
}
// Outras lógicas de inicialização podem ser adicionadas aqui
main();
// --- IGNORE ---



// ✅ Sucesso! Produto encontrado para a empresa JP.
// {
//   itens: [
//     {
//       id: 785316587,
//       sku: 'JP7996',
//       descricao: '5mts de Linha Para Vara Telescópica',
//       tipo: 'S',
//       situacao: 'A',
//       dataCriacao: '2023-12-14 16:46:49',
//       dataAlteracao: '2025-01-30 16:56:35',
//       unidade: 'UN',
//       gtin: '',
//       precos: [Object]
//     }
//   ],
//   paginacao: { limit: 1, offset: 0, total: 15680 }
// }