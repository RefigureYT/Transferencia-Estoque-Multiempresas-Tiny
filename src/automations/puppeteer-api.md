# `puppeteer-api.js`

Este módulo é responsável por automatizar interações com o navegador usando Puppeteer, especificamente para realizar o login no Tiny ERP e baixar planilhas de inventário. Ele utiliza `puppeteer-extra` com o plugin `stealth` para evitar detecção e simular um usuário real.

## Funcionalidades Principais

O módulo oferece duas funcionalidades principais. A primeira é a função **`limparArquivosPorExtensao(dirPath, allowedExtensions)`**, que remove arquivos com extensões específicas de um diretório. Esta funcionalidade é crucial para garantir que planilhas antigas sejam removidas antes de baixar novas, prevenindo conflitos ou o uso de dados desatualizados. Os parâmetros necessários são `dirPath` (string), que especifica o caminho do diretório a ser limpo, e `allowedExtensions` (array de strings), uma lista das extensões de arquivo a serem removidas (por exemplo, `[".csv", ".xls"]`).

A segunda funcionalidade é **`baixarPlanilhaDeposito(user, pass, idDeposito, outputPath)`**, que automatiza o processo de login no Tiny ERP e o download de uma planilha de inventário de um depósito específico. O fluxo de execução desta função envolve configurar e garantir a existência do diretório de destino, limpar quaisquer arquivos de planilha existentes para evitar duplicação, iniciar uma instância do Puppeteer em modo `headless` (sem interface gráfica), navegar até a página de login do Tiny ERP, preencher os campos de usuário e senha, lidar com possíveis modais de sessão ativa anterior, extrair os cookies da sessão para autenticar a requisição de download, construir a URL de download da planilha com base no `idDeposito` fornecido, realizar o download da planilha usando `https` e salvá-la no `outputPath`, e finalmente, fechar o navegador Puppeteer. Os parâmetros incluem `user` (string) e `pass` (string) para o login no Tiny ERP, `idDeposito` (string) para o ID do depósito do relatório, e `outputPath` (string) para o caminho completo do arquivo onde a planilha será salva. A função retorna uma Promise que resolve com o caminho completo para o arquivo baixado.

## Dependências

As dependências deste módulo incluem `puppeteer-extra` para o controle do navegador, `puppeteer-extra-plugin-stealth` para evitar a detecção de automação, `https` para realizar requisições HTTP seguras (utilizado no download do arquivo), `fs` para operações de sistema de arquivos (leitura, escrita e exclusão), e `path` para a manipulação de caminhos de arquivo.

## Como Depurar

Para depurar este módulo, observe os **logs no console**, pois ele utiliza `console.log` para indicar o progresso da automação (login, preenchimento de campos, download) e `console.error` para reportar falhas. Para depurar visualmente, você pode alterar `headless: true` para `headless: false` na função `baixarPlanilhaDeposito` ao chamar `puppeteer.launch()`, o que fará com que o navegador seja aberto e permitirá observar as interações. **Erros de timeout** podem ocorrer se a rede estiver lenta ou se os seletores de elementos da página mudarem; verifique as mensagens de erro relacionadas a `waitForSelector` ou `page.goto`. Em caso de **erros de download**, verifique o `statusCode` da resposta HTTP e as mensagens de erro do `fileStream` para identificar problemas de rede ou permissão de escrita.
