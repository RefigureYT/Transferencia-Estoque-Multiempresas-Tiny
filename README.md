<p align="center">
  <a href="https://wakatime.com/badge/user/db4a2800-e564-4201-9406-b98e170a6764/project/793e5664-f479-4e1d-be8c-f987943458a1">
    <img src="https://wakatime.com/badge/user/db4a2800-e564-4201-9406-b98e170a6764/project/793e5664-f479-4e1d-be8c-f987943458a1.svg?style=for-the-badge&label=Tempo&logo=wakatime&color=blueviolet" alt="WakaTime">
  </a>
  <img src="https://img.shields.io/badge/status-active-success?style=for-the-badge" alt="Status">
  <img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="License">
</p>

# Transferência de Estoque Multiempresas para Tiny ERP

Este script automatiza a sincronização de estoque entre múltiplas empresas no Tiny ERP. A principal funcionalidade é centralizar o estoque em uma empresa "master" e espelhar esse estoque para as empresas "filiais". Ele lê o estoque das filiais a partir de planilhas de inventário, compara com o da master e realiza as transferências necessárias via API do Tiny.

## Funcionalidades

-   **Sincronização de Estoque:** Transfere o estoque de produtos entre uma empresa principal (master) e múltiplas empresas filiais.
-   **Automação com Puppeteer:** Faz o login no Tiny ERP e baixa as planilhas de inventário de forma automática.
-   **Validação de Ambiente:** Verifica se todas as variáveis de ambiente necessárias estão configuradas corretamente antes de executar.
-   **Tratamento de Erros:** Lida com erros comuns de API, como tokens expirados e limites de requisição, com um sistema de retentativas.
-   **Configuração Flexível:** Permite adicionar novas empresas facilmente através do arquivo de configuração `.env`.

## Pré-requisitos

-   Node.js (versão 14 ou superior)
-   NPM (geralmente instalado com o Node.js)

## Instalação

1.  Clone este repositório para a sua máquina local.
2.  Navegue até o diretório do projeto:

    ```bash
    cd Transferencia-Estoque-Multiempresas-Tiny
    ```

3.  Instale as dependências do projeto:

    ```bash
    npm install
    ```

## Configuração do `.env`

Antes de executar o script, você precisa criar e configurar o arquivo `.env` na raiz do projeto. Este arquivo contém todas as informações sensíveis e de configuração necessárias para o funcionamento do script. Use o arquivo `.env.example` como base.

O script encerrará a execução e avisará qual informação está faltando caso alguma variável obrigatória não seja preenchida.

### Variáveis de Ambiente

| Variável | Obrigatório | Descrição |
| --- | :---: | --- |
| `DB_HOST` | Sim | O endereço do host do seu banco de dados PostgreSQL. |
| `DB_PORT` | Sim | A porta do seu banco de dados PostgreSQL. |
| `DB_USER` | Sim | O nome de usuário para acessar o banco de dados. |
| `DB_PASSWORD` | Sim | A senha para acessar o banco de dados. |
| `DB_DATABASE` | Sim | O nome do banco de dados a ser utilizado. |
| `DB_SSL` | Sim | Defina como `true` ou `false` para habilitar ou desabilitar a conexão SSL. |
| `ACTIVE_COMPANIES` | Sim | Uma lista de siglas de empresas separadas por vírgula (ex: `JP,LT,JF`). |

### Configuração por Empresa

Para cada sigla de empresa listada em `ACTIVE_COMPANIES`, você deve adicionar um bloco de configuração correspondente. Substitua `EMPRESA` pela sigla da empresa (ex: `JP`, `LT`).

| Variável | Obrigatório | Descrição |
| --- | :---: | --- |
| `EMPRESA_NOME` | Sim | O nome completo da empresa para identificação nos logs. |
| `EMPRESA_IS_MASTER` | Sim | Defina como `true` para a empresa principal e `false` para as filiais. **Deve haver exatamente uma empresa master.** |
| `EMPRESA_TOKEN_SOURCE` | Sim | Define a origem do token da API. Use `db` para buscar no banco de dados ou `env` para ler diretamente do `.env`. |
| `EMPRESA_TOKEN_QUERY` | Se `_TOKEN_SOURCE` for `db` | A query SQL que retorna o token de acesso da API para a empresa. |
| `EMPRESA_TOKEN` | Se `_TOKEN_SOURCE` for `env` | O token de acesso da API para a empresa. |
| `EMPRESA_ID_DEPOSITO` | Não | O ID do depósito do Tiny ERP. Se não for fornecido, o script listará todos os depósitos disponíveis e encerrará para que você possa preencher. |
| `EMPRESA_USER_TINY` | Para filiais | O nome de usuário para login no Tiny ERP. Necessário para baixar a planilha de inventário. |
| `EMPRESA_PASS_TINY` | Para filiais | A senha para login no Tiny ERP. |

## Como Executar o Script

Após configurar o arquivo `.env`, você pode iniciar o script com o seguinte comando:

```bash
npm start
```

O script começará a executar o processo de validação, download de planilhas e transferência de estoque. Acompanhe o console para ver os logs de progresso e eventuais erros.

## Estrutura do Projeto

```
/Transferencia-Estoque-Multiempresas-Tiny
|-- /src
|   |-- /automations
|   |   |-- puppeteer-api.js  # Automação de login e download de planilhas
|   |-- /config
|   |   |-- index.js          # Validação e configuração do ambiente
|   |-- /services
|   |   |-- database.service.js # Conexão e queries com o banco de dados
|   |   |-- session.service.js  # Gerenciamento de tokens de acesso
|   |   |-- sheet.service.js    # Leitura e filtragem de planilhas
|   |   |-- tinyApi.service.js  # Interação com a API do Tiny ERP
|   |-- main.js               # Ponto de entrada e orquestração do script
|-- .env                      # Arquivo de configuração (NÃO versionar)
|-- package.json
|-- README.md
```

## Depuração

-   **Logs no Console:** O script fornece logs detalhados sobre cada etapa do processo. Verifique o console para identificar onde um problema pode ter ocorrido.
-   **Validação do `.env`:** Se o script encerrar no início, verifique as mensagens de erro. Elas indicarão exatamente qual variável de ambiente está faltando ou configurada incorretamente.
-   **Falha no Login (Puppeteer):** Se a automação de login falhar, pode ser que a interface do Tiny ERP tenha sido atualizada. Verifique os seletores de CSS no arquivo `puppeteer-api.js`. Você também pode desativar o modo `headless` no Puppeteer para visualizar a automação em tempo real.
-   **Erros da API Tiny:** Erros de API são capturados e detalhados no console, incluindo o status da resposta e a mensagem de erro, o que ajuda a diagnosticar problemas de comunicação com o Tiny ERP.

