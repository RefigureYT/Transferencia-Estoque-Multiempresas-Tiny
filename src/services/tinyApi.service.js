// ###   ./src/services/tinyApi.service.js   ###
import { executarQueryInDb } from './database.service.js';


export async function buscarNovoTokenDaAPI() {
    console.log('Tentando buscar chave de API');
    console.log(`Query: ${process.env.JP_TOKEN_QUERY}`);
    const resultado = await executarQueryInDb(process.env.JP_TOKEN_QUERY, []);
    return resultado;
}