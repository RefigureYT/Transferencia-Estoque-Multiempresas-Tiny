# `session.service.js`

Este módulo é responsável por gerenciar os tokens de acesso (Access Tokens) da API Tiny para cada empresa configurada. Ele garante que um token válido esteja sempre disponível para as requisições da API, buscando um novo token quando necessário ou utilizando um token em cache.

## Funcionalidades Principais

O módulo `session.service.js` oferece duas funcionalidades principais para o gerenciamento de tokens. A primeira é a função **`getAccessToken(empresa)`**, que serve como o ponto de entrada principal para obter um token de acesso. Esta função verifica se já existe um token válido em cache para a empresa especificada. Se um token estiver disponível em cache, ele é retornado imediatamente. Caso contrário, ou se o token estiver expirado (situação tratada por `tinyApi.service.js` que invoca `revalidarToken`), um novo token é solicitado através da função `revalidarToken`. O token recém-obtido é então armazenado em cache para otimizar usos futuros. O parâmetro `empresa` (string) é a sigla da empresa (ex: `JP`) para a qual o token de acesso é necessário, e a função retorna uma Promise que resolve com o token de acesso válido.

A segunda funcionalidade é a função **`revalidarToken(querySql)`**, que força a busca por um novo token de acesso. Esta função é tipicamente chamada quando uma requisição à API Tiny retorna um erro de autenticação (códigos 401 ou 403). Ela utiliza a função `buscarNovoTokenDaAPI` (proveniente de `tinyApi.service.js`) para executar uma query SQL no banco de dados e obter o novo token. Uma vez obtido, o novo token é armazenado na lista de tokens em memória (`_listaTokensEmpresa`) para a empresa correspondente. O parâmetro `querySql` (string) é a query SQL configurada no `.env` para buscar o token no banco de dados, e a função retorna uma Promise que resolve com o novo token de acesso. Em termos de tratamento de erros, se a busca por um novo token falhar, um erro é registrado e o token antigo é limpo, forçando uma nova tentativa na próxima requisição.

## Dependências

As dependências deste módulo incluem `tinyApi.service.js` para a função `buscarNovoTokenDaAPI` e `main.js` para acessar a variável global `listaEmpresasDefinidas`.

## Como Depurar

Para depurar este módulo, é recomendável observar os **logs no console**, que fornecem informações sobre o uso do cache de tokens e o processo de revalidação. Em caso de **erros de revalidação**, se a função falhar, uma mensagem de erro crítica será exibida no console, indicando que a busca por um novo token retornou um valor vazio ou que houve um erro na execução da query SQL. Nesses casos, é importante verificar a `querySql` configurada no `.env` e a conectividade com o banco de dados.
