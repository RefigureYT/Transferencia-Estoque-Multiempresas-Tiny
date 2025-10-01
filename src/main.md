# `main.js`

Este é o ponto de entrada principal da aplicação, responsável por orquestrar o fluxo de transferência de estoque entre múltiplas empresas no Tiny ERP. Ele coordena a validação das variáveis de ambiente, o download das planilhas de estoque, a filtragem dos dados e a execução das transferências via API.

## Funcionalidades Principais

As principais funcionalidades deste módulo incluem a **validação do ambiente**, que garante que todas as variáveis de ambiente necessárias (`.env`) estejam configuradas corretamente antes de iniciar o processo. Ele também gerencia o **download de planilhas**, utilizando o serviço `tinyPuppeteer.service.js` para automatizar o login no Tiny ERP e baixar as planilhas de inventário das empresas filiais. Além disso, é responsável pelo **processamento de estoque**, filtrando produtos com estoque diferente de zero nas planilhas baixadas e coordenando a transferência desses estoques para a empresa master ou vice-versa, dependendo do saldo. Por fim, implementa um **tratamento robusto de erros** para falhas na API e outros problemas inesperados, garantindo que o script possa continuar ou fornecer feedback claro.

## Fluxo de Execução

O fluxo de execução do script é dividido em etapas sequenciais:

1.  **`allValidations()`:** Inicialmente, esta função verifica a presença e validade das variáveis de ambiente essenciais. Em seguida, define a lista de empresas ativas com base nas configurações do `.env` e obtém os tokens de acesso para cada empresa via `session.service.js`. Uma verificação crucial é feita para os IDs de depósito: caso não estejam preenchidos, o script lista os depósitos disponíveis e encerra, permitindo que o usuário configure corretamente.

2.  **Download e Limpeza de Planilhas:** Após as validações, o script limpa arquivos de planilha antigos no diretório `./data` para evitar dados desatualizados. Em seguida, baixa as planilhas de inventário de cada empresa filial usando a função `baixarPlanilhaDeposito`.

3.  **Processamento de Transferência:** O script itera sobre cada empresa filial. Para cada uma, filtra a planilha correspondente para encontrar produtos com `estoque_atual` diferente de zero, utilizando a função `filtrarPlanilha`. Para cada produto filtrado, a função `transfEstoque()` é chamada.

4.  **`transfEstoque(p, empresaFilial, objEmpresaMaster)`:** Esta função valida o estoque do produto (`p`). Se o estoque for zero, a transferência é pulada. Em seguida, busca o produto tanto na empresa master quanto na filial usando `getProdTiny`. A direção da transferência é determinada: se `p.estoque_atual > 0`, o estoque é transferido da filial para a master (saída na filial, entrada na master); se `p.estoque_atual < 0`, o estoque é transferido da master para a filial (saída na master, entrada na filial). A movimentação de estoque é executada usando `editEstoqueProdTiny`, e erros específicos da API Tiny (`TinyApiError`) são capturados e detalhados para facilitar a depuração.

## Variáveis Globais

A variável global `listaEmpresasDefinidas` é uma lista de objetos, onde cada objeto representa uma empresa configurada no `.env` com suas respectivas informações (tokens, IDs de depósito, etc.). Esta variável é populada pela função `definirEmpresas()` localizada em `config/index.js`.

## Como Depurar

Para depurar o script, observe os **logs no console**, pois o script utiliza `console.log` e `console.error` extensivamente para fornecer feedback sobre o progresso e quaisquer problemas. Em caso de **erros de validação**, se o script encerrar devido a variáveis de ambiente ausentes ou incorretas, a mensagem de erro indicará exatamente qual variável precisa ser corrigida no arquivo `.env`. Erros específicos da API Tiny, encapsulados como `TinyApiError`, são capturados e detalhados, incluindo status HTTP, URL da requisição e resposta da API, facilitando a identificação da causa raiz de falhas na comunicação com o Tiny ERP. Por fim, o uso de `process.exit(1)` indica falhas críticas que impedem a continuidade da execução, enquanto `process.exit(0)` sinaliza sucesso.
