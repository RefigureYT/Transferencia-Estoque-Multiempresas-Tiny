// ### ./src/main.js ###

// Importa as variáveis do .env
import dotenv from 'dotenv';
dotenv.config();

import { logEnvVariables } from './config/index.js';
import { getAccessToken } from './services/session.service.js';

console.log('Validando .env');

async function main() {
    const allVariables = await logEnvVariables();

    if (!allVariables) {
        console.error('❌ Erro: Falha na validação das variáveis de ambiente. Verifique o .env e tente novamente.');
        process.exit(1); // Sai do processo com código de erro
    }
    console.log('✅ Variáveis de ambiente validadas com sucesso. Iniciando o sistema...');

    // Agora ele deve verificar todas as empresas que foram adicionadas dentro do .env
    // Com base nelas que ele vai recuperar posteriormente os tokens da API
    
    let accessToken = await getAccessToken();
    console.log('accessToken ->', accessToken[0].access_token);
}

// Outras lógicas de inicialização podem ser adicionadas aqui
main();
// --- IGNORE ---