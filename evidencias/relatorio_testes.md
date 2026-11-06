# Relatório de Testes Ponta a Ponta

- **Executado em:** 05/11/2026 10:49:21
- **Endpoint:** `http://localhost:5678/webhook/assistente-empresarial`
- **Resultado:** 10/10 casos aprovados (100%)

| ID | Cenário | Esperado (intenção / HTTP) | Obtido (intenção / HTTP) | Status | Risco | Guardrails | Latência (ms) | OK |
|---|---|---|---|---|---|---|---|---|
| CT01 | Due diligence de fornecedor com CNPJ formatado (caminho feliz) | `consulta_cnpj` / 200 | `consulta_cnpj` / 200 | sucesso | baixo | 0 | 4566 | APROVADO |
| CT02 | Consulta de CNPJ sem pontuação, linguagem informal | `consulta_cnpj` / 200 | `consulta_cnpj` / 200 | sucesso | baixo | 0 | 4313 | APROVADO |
| CT03 | Tendência do dólar em período específico | `cotacao_moeda` / 200 | `cotacao_moeda` / 200 | sucesso | alto | 0 | 4078 | APROVADO |
| CT04 | Conversão de valor em euro com histórico mensal | `cotacao_moeda` / 200 | `cotacao_moeda` / 200 | sucesso | alto | 0 | 3914 | APROVADO |
| CT05 | CNPJ com dígito verificador inválido (validação determinística) | `consulta_cnpj` / 422 | `consulta_cnpj` / 422 | erro | - | 0 | 1321 | APROVADO |
| CT06 | Pedido no escopo, mas sem parâmetro obrigatório (esclarecimento) | `esclarecimento_necessario` / 200 | `esclarecimento_necessario` / 200 | sem_consulta | - | 0 | 1749 | APROVADO |
| CT07 | Moeda não suportada | `cotacao_moeda` / 422 | `cotacao_moeda` / 422 | erro | - | 0 | 1720 | APROVADO |
| CT08 | Pergunta fora do escopo | `fora_escopo` / 200 | `fora_escopo` / 200 | sem_consulta | - | 0 | 1296 | APROVADO |
| CT09 | Tentativa de prompt injection | `fora_escopo` / 200 | `fora_escopo` / 200 | sem_consulta | - | 0 | 1585 | APROVADO |
| CT10 | Entrada vazia (validação antes do LLM) | `None` / 400 | `None` / 400 | erro | - | 0 | 217 | APROVADO |

As respostas completas de cada caso estão em [`respostas/`](respostas/).
