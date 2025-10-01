# `config/index.js`

Este módulo é central para a configuração e validação do ambiente da aplicação. Ele lê as variáveis do arquivo `.env`, verifica se todas as informações necessárias estão presentes e estrutura os dados das empresas para uso em outros módulos.

## Funcionalidades Principais

O módulo `config/index.js` oferece três funcionalidades principais para gerenciar a configuração do ambiente. Primeiramente, a função **`logEnvVariables()`** é responsável por validar a presença de variáveis de ambiente obrigatórias, como credenciais do banco de dados e a lista de empresas ativas (`ACTIVE_COMPANIES`). Ela itera sobre cada empresa definida em `ACTIVE_COMPANIES`, verificando se todas as variáveis específicas da empresa (como `_NOME`, `_TOKEN_SOURCE`, `_USER_TINY`, `_PASS_TINY`) estão preenchidas. Uma validação crucial é garantir que exatamente uma empresa seja designada como `_IS_MASTER`. Adicionalmente, esta função testa a conexão com o banco de dados usando `conectarAoBanco` e encerra o script com uma mensagem de erro clara se qualquer validação falhar.

Em segundo lugar, a função **`definirEmpresas()`** lê a lista de empresas ativas do `.env`. Para cada empresa, ela cria um objeto contendo todas as suas informações de configuração, como nome, credenciais, token e ID do depósito. Esta função retorna um array de objetos, onde cada objeto representa uma empresa configurada, e este array é utilizado globalmente na aplicação através da variável `listaEmpresasDefinidas` em `main.js`.

Por fim, a função **`semDepositosEnv()`** é invocada quando a validação em `logEnvVariables` detecta que o `_ID_DEPOSITO` de alguma empresa não foi preenchido no `.env`. Sua finalidade é buscar todos os depósitos disponíveis para cada empresa utilizando `getEstoqueProdTiny` e exibir uma tabela no console com os IDs e nomes dos depósitos. Isso permite que o usuário copie o ID correto para o arquivo `.env`, após o que o script é encerrado.

## Variáveis de Ambiente (`.env`)

Este módulo depende de uma configuração detalhada no arquivo `.env`. A estrutura esperada é a seguinte:

### Configuração do Banco de Dados

| Variável | Descrição |
| :------- | :-------- |
| `DB_HOST` | O endereço do host do seu banco de dados PostgreSQL. |
| `DB_PORT` | A porta do seu banco de dados PostgreSQL. |
| `DB_USER` | O nome de usuário para acessar o banco de dados. |
| `DB_PASSWORD` | A senha para acessar o banco de dados. |
| `DB_DATABASE` | O nome do banco de dados a ser utilizado. |
| `DB_SSL` | Defina como `true` ou `false` para habilitar ou desabilitar a conexão SSL. |

### Configuração de Empresas Ativas

| Variável | Descrição |
| :--------------- | :-------- |
| `ACTIVE_COMPANIES` | Uma lista de siglas de empresas separadas por vírgula (ex: `JP,LT,JF`). |

### Configuração por Empresa (Substitua `EMPRESA` pela sigla da empresa)

| Variável | Obrigatório | Descrição |
| :------------------- | :----------: | :-------- |
| `EMPRESA_NOME` | Sim | O nome completo da empresa para identificação nos logs. |
| `EMPRESA_IS_MASTER` | Sim | Defina como `true` para a empresa principal e `false` para as filiais. **Deve haver exatamente uma empresa master.** |
| `EMPRESA_TOKEN_SOURCE` | Sim | Define a origem do token da API. Use `db` para buscar no banco de dados ou `env` para ler diretamente do `.env`. |
| `EMPRESA_TOKEN_QUERY` | Se `_TOKEN_SOURCE` for `db` | A query SQL que retorna o token de acesso da API para a empresa. |
| `EMPRESA_TOKEN` | Se `_TOKEN_SOURCE` for `env` | O token de acesso da API para a empresa. |
| `EMPRESA_ID_DEPOSITO` | Não | O ID do depósito do Tiny ERP. Se não for fornecido, o script listará todos os depósitos disponíveis e encerrará para que você possa preencher. |
| `EMPRESA_USER_TINY` | Para filiais | O nome de usuário para login no Tiny ERP. Necessário para baixar a planilha de inventário. |
| `EMPRESA_PASS_TINY` | Para filiais | A senha para login no Tiny ERP. |

## Como Depurar

Para depurar este módulo, é fundamental observar as **mensagens de erro** no console. Se o script for encerrado, a mensagem de erro será específica, indicando qual variável está faltando ou configurada incorretamente no `.env`. A **validação da empresa master** é crítica: se houver mais de uma ou nenhuma empresa master configurada, o script informará o erro e será encerrado. Por fim, a função `logEnvVariables` testa a **conexão com o banco de dados** no início; se a conexão falhar, o script não prosseguirá, e a causa da falha deverá ser investigada nas configurações do banco de dados no `.env`.
