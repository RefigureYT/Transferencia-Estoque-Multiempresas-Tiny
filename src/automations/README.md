# API de Automação Tiny ERP

Esta API Node.js foi desenvolvida para automatizar o processo de login no Tiny ERP, navegar até uma URL específica e realizar o download de um relatório, utilizando Puppeteer em modo stealth e headless.

## Funcionalidades

*   **Automação de Login**: Realiza o login no Tiny ERP com credenciais fornecidas.
*   **Download de Relatórios**: Acessa uma URL de relatório e faz o download do arquivo.
*   **Modo Stealth**: Utiliza `puppeteer-extra` com `puppeteer-extra-plugin-stealth` para evitar a detecção de automação.
*   **Modo Headless**: Executa o navegador em segundo plano, sem interface gráfica, ideal para ambientes de servidor.
*   **API REST**: Expõe endpoints para iniciar e encerrar a execução da automação.
*   **Tratamento de Erros e Timeout**: Inclui mecanismos para lidar com erros e um timeout de segurança para encerrar execuções longas.

## Pré-requisitos

Antes de começar, certifique-se de ter o seguinte instalado em seu sistema:

*   [Node.js](https://nodejs.org/en/) (versão 14 ou superior recomendada)
*   [npm](https://www.npmjs.com/) (gerenciador de pacotes do Node.js, geralmente vem com o Node.js)

## Instalação

1.  **Clone o repositório** (ou baixe o arquivo `api.js`):

    ```bash
    # Se estiver em um repositório git
    git clone <url-do-seu-repositorio>
    cd <nome-do-repositorio>
    ```

2.  **Instale as dependências**: Navegue até o diretório onde o arquivo `api.js` está localizado e execute o seguinte comando:

    ```bash
    npm install express puppeteer-extra puppeteer-extra-plugin-stealth
    ```

## Como Usar

### 1. Iniciar a API

Para iniciar o servidor da API, execute o seguinte comando no terminal, no diretório do projeto:

```bash
node api.js
```

Você verá uma mensagem no console indicando que a API está rodando, geralmente na porta `3001`:

```
🚀 API rodando em http://localhost:3001
➡️ Endpoint de execução: POST http://localhost:3001/run
➡️ Endpoint de encerramento: POST http://localhost:3001/encerrar
```

### 2. Endpoint de Execução: `/run`

Este endpoint inicia o processo de login e download do relatório. Ele espera um corpo de requisição JSON com as credenciais de usuário, senha e a URL do relatório.

*   **Método**: `POST`
*   **URL**: `http://localhost:3001/run`
*   **Corpo da Requisição (JSON)**:

    ```json
    {
        "user": "seu_usuario_tiny",
        "pass": "sua_senha_tiny",
        "url": "https://erp.tiny.com.br/sua/url/do/relatorio/para/download"
    }
    ```

*   **Respostas Possíveis**:
    *   `200 OK`: O download foi concluído com sucesso e o arquivo `inventario.xls` é enviado como resposta.
    *   `400 Bad Request`: Parâmetros `user`, `pass` ou `url` ausentes.
    *   `429 Too Many Requests`: Já existe uma execução em andamento.
    *   `500 Internal Server Error`: Erro durante o login, download ou salvamento do arquivo.
    *   `504 Gateway Timeout`: A operação excedeu o tempo limite de 10 minutos.

**Exemplo de Requisição (usando `curl`)**:

```bash
curl -X POST \\
     -H "Content-Type: application/json" \\
     -d '{ "user": "seu_usuario", "pass": "sua_senha", "url": "https://erp.tiny.com.br/sua/url/do/relatorio" }' \\
     http://localhost:3001/run \
     --output inventario.xls
```

### 3. Endpoint de Encerramento: `/encerrar`

Este endpoint permite encerrar manualmente qualquer execução de automação que esteja em andamento. Isso é útil se uma execução travar ou precisar ser interrompida.

*   **Método**: `POST`
*   **URL**: `http://localhost:3001/encerrar`
*   **Corpo da Requisição**: Não requer corpo.

*   **Respostas Possíveis**:
    *   `200 OK`: Execução encerrada com sucesso.
    *   `404 Not Found`: Nenhuma execução em andamento para encerrar.

**Exemplo de Requisição (usando `curl`)**:

```bash
curl -X POST http://localhost:3001/encerrar
```

## Observações Importantes

*   **Segurança**: As credenciais (`user` e `pass`) são enviadas diretamente no corpo da requisição POST. Certifique-se de que a comunicação com a API seja segura (por exemplo, dentro de uma rede local confiável ou com HTTPS configurado).
*   **Ambiente Linux**: A API foi configurada com argumentos específicos do Puppeteer (`--no-sandbox`, `--disable-setuid-sandbox`) para melhor compatibilidade em ambientes Linux.
*   **Conexão do Cliente**: Se a conexão do cliente que fez a requisição `/run` for fechada antes da conclusão da operação, a execução do Puppeteer será automaticamente encerrada.
*   **Arquivo Temporário**: Um arquivo `relatorio_inventario.xls` é criado temporariamente no diretório da API e é removido automaticamente após o download ou em caso de erro/encerramento.

---

**Autor**: Kelvin Mattos
**Data**: 30 de Setembro de 2025