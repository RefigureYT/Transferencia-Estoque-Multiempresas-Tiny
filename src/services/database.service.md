# `database.service.js`

Este módulo gerencia a conexão e a execução de queries no banco de dados PostgreSQL, utilizando a biblioteca `pg`. Ele abstrai a complexidade do pool de conexões e fornece funções simples para interagir com o banco.

## Funcionalidades Principais

O módulo `database.service.js` é responsável pela **gestão do pool de conexões**, configurando e inicializando um pool de conexões com base nas variáveis de ambiente (`DB_HOST`, `DB_PORT`, etc.). Ele utiliza "ouvintes" de eventos (`pool.on`) para monitorar o estado das conexões, o que é uma funcionalidade útil para depuração e monitoramento do comportamento do banco de dados.

Além disso, o módulo oferece a função **`conectarAoBanco()`**, que tenta estabelecer uma conexão com o banco de dados. Esta função é crucial para verificar se as credenciais e a configuração de rede estão corretas, retornando `true` em caso de sucesso e `false` em caso de falha, o que permite à aplicação validar a conexão antes de prosseguir com operações mais complexas.

A função **`executarQueryInDb(sqlCommand, params = [])`** é a interface principal para interagir com o banco de dados. Ela obtém uma conexão do pool, executa um comando SQL e, em seguida, libera a conexão de volta para o pool. Esta função aceita `sqlCommand` (string), que é o comando SQL a ser executado (utilizando `$1`, `$2`, etc., para parâmetros seguros), e `params` (array), que é um array de valores para substituir os parâmetros no `sqlCommand`. Em caso de sucesso, retorna uma Promise que resolve com um array de objetos, onde cada objeto representa uma linha do resultado da query. A função também implementa **tratamento de erros**, capturando e lançando exceções de execução de query, permitindo que a função chamadora trate a falha de forma apropriada.

## Configuração

Este módulo depende das seguintes variáveis de ambiente para configurar a conexão com o banco de dados:

| Variável | Descrição |
| :------- | :-------- |
| `DB_HOST` | O endereço do host do host do seu banco de dados PostgreSQL. |
| `DB_PORT` | A porta do seu banco de dados PostgreSQL. |
| `DB_USER` | O nome de usuário para acessar o banco de dados. |
| `DB_PASSWORD` | A senha para acessar o banco de dados. |
| `DB_DATABASE` | O nome do banco de dados a ser utilizado. |
| `DB_SSL` | Defina como `true` ou `false` para habilitar ou desabilitar a conexão SSL. |

## Como Depurar

Para depurar este módulo, você pode descomentar os `console.log` dentro dos "ouvintes" de eventos (`pool.on("error")`, `pool.on("connect")`, etc.) para obter **logs detalhados dos eventos do pool** de conexões. Em caso de **erros de conexão**, a função `conectarAoBanco` retornará `false` e registrará um erro no console; neste cenário, é fundamental verificar as credenciais do banco de dados e as configurações de rede (firewall, etc.). Se ocorrerem **erros de query**, a função `executarQueryInDb` lançará uma exceção, e a mensagem de erro do PostgreSQL geralmente fornecerá detalhes sobre o problema, como sintaxe incorreta ou tabela não encontrada.
