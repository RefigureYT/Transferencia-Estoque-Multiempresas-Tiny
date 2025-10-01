# `sheet.service.js`

Este módulo fornece uma funcionalidade robusta para ler e filtrar dados de planilhas (arquivos `.xlsx`, `.xls`, etc.) usando a biblioteca `xlsx`. Ele permite extrair informações específicas de uma planilha com base em critérios de filtro definidos pelo usuário.

## Funcionalidades Principais

A principal funcionalidade deste módulo é a função **`filtrarPlanilha(filePath, coluna, filtro, opts = {})`**. Esta função lê um arquivo de planilha e converte seu conteúdo em um array de objetos JavaScript, onde cada objeto representa uma linha da planilha e as chaves são os cabeçalhos normalizados das colunas. Em seguida, aplica um filtro complexo aos dados da planilha com base em uma coluna específica e uma expressão de filtro.

Os parâmetros para `filtrarPlanilha` são:

| Parâmetro | Tipo | Descrição |
| :-------- | :--- | :-------- |
| `filePath` | `string` | O caminho completo para o arquivo da planilha (ex: `./data/inventario.xlsx`). |
| `coluna` | `string` | O nome do cabeçalho da coluna a ser filtrada (ex: `"Estoque Atual"`) ou a letra da coluna (ex: `"F"`). |
| `filtro` | `string` | A expressão de filtro a ser aplicada. Suporta operadores de comparação (`=`, `!=`, `>`, `>=`, `<`, `<=`) e operadores lógicos (`&&`, `||`). Exemplos incluem `"=10"` (valores iguais a 10), `">0"` (valores maiores que 0), `">0 && <100"` (valores entre 1 e 100) e `"=Wow"` (valores de string iguais a "Wow"). |
| `opts` | `object` (opcional) | Um objeto de opções que atualmente suporta `sheet` para especificar o nome da aba da planilha (o padrão é a primeira aba). |

A função retorna um array de objetos, onde cada objeto representa uma linha que passou no filtro.

## Funções Auxiliares (Internas)

O módulo também inclui várias funções auxiliares internas que suportam a funcionalidade principal de filtragem:

*   **`colLetterToIndex(letter)`:** Converte uma letra de coluna (ex: "A", "AA") para seu índice numérico (0, 26).
*   **`toNumber(val)`:** Normaliza uma string numérica (considerando formatos BR/US) para um número.
*   **`compare(a, b, op)`:** Realiza comparações numéricas ou de string com base no operador fornecido.
*   **`buildFilterEvaluator(exprRaw)`:** Constrói uma função avaliadora de filtro a partir de uma expressão de filtro bruta, suportando operadores lógicos e de comparação.
*   **`splitTopLevel(s, sep)`:** Divide uma string por um separador de nível superior.
*   **`parseSimpleCondition(condRaw)`:** Converte uma string de condição simples em uma função predicado.
*   **`stripQuotes(s)`:** Remove aspas simples ou duplas de uma string.
*   **`normalizeHeader(str)`:** Normaliza strings de cabeçalho para serem usadas como chaves de objeto (minúsculas, sem acentos, espaços/caracteres especiais convertidos para underscore).

## Dependências

As dependências deste módulo são a biblioteca `xlsx` para leitura e escrita de arquivos de planilha, e o módulo `path` para manipulação de caminhos de arquivo.

## Como Depurar

Para depurar este módulo, é importante verificar alguns pontos críticos. Primeiramente, em caso de **erros de caminho/aba**, certifique-se de que o `filePath` está correto e que o nome da aba (`opts.sheet`) realmente existe na planilha. Para **erros de coluna**, confirme que o nome da `coluna` fornecido corresponde exatamente a um cabeçalho na planilha ou é uma letra de coluna válida; a função `normalizeHeader` é usada internamente, então considere como os cabeçalhos são normalizados. Ao lidar com **expressões de filtro**, teste expressões simples antes de usar complexas e verifique a sintaxe dos operadores (`=`, `!=`, `>`, `>=`, `<`, `<=`, `&&`, `||`) e o uso correto de aspas para strings (ex: `"Valor"` ou `\"Valor\"`). Finalmente, para **dados de entrada**, verifique o formato dos dados na planilha, especialmente se houver valores numéricos que podem ser interpretados como strings ou vice-versa, pois inconsistências podem causar resultados inesperados, apesar da função `toNumber` tentar normalizar esses valores.
