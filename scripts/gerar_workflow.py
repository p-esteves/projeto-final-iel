"""
Monta o arquivo workflow/assistente-empresarial.n8n.json injetando os prompts
e schemas da pasta prompts/ dentro dos nós de código de workflow/src/.

Como rodar:
  python scripts/gerar_workflow.py
"""
from __future__ import annotations

import json
import uuid
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
PASTA_SRC = RAIZ / "workflow" / "src"
PASTA_PROMPTS = RAIZ / "prompts"
ARQUIVO_SAIDA = RAIZ / "workflow" / "assistente-empresarial.n8n.json"

NAMESPACE_ID = uuid.UUID("6f1c2a52-0d4e-4f7b-9a51-3c0d2b7e9a10")
CONFIG_PENSAMENTO = "thinkingConfig: { thinkingBudget: 0 },"


def gerar_id(nome: str) -> str:
    return str(uuid.uuid5(NAMESPACE_ID, nome))


def ler_texto(caminho: Path) -> str:
    return caminho.read_text(encoding="utf-8")


def injetar_prompt(arquivo_js: str, arquivo_prompt: str, arquivo_schema: str) -> str:
    codigo = ler_texto(PASTA_SRC / arquivo_js)
    prompt = ler_texto(PASTA_PROMPTS / arquivo_prompt).strip()
    schema = json.loads(ler_texto(PASTA_PROMPTS / arquivo_schema))
    codigo = codigo.replace("__SYSTEM_PROMPT__", json.dumps(prompt, ensure_ascii=False))
    codigo = codigo.replace("__RESPONSE_SCHEMA__", json.dumps(schema, ensure_ascii=False, indent=2))
    codigo = codigo.replace("__THINKING_CONFIG__", CONFIG_PENSAMENTO)
    return codigo


def criar_no_codigo(nome: str, codigo_js: str, posicao: list[int], notas: str) -> dict:
    return {
        "parameters": {"jsCode": codigo_js},
        "id": gerar_id(nome),
        "name": nome,
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": posicao,
        "notes": notas,
        "notesInFlow": True,
    }


def criar_no_gemini(nome: str, posicao: list[int], notas: str) -> dict:
    return {
        "parameters": {
            "method": "POST",
            "url": "=https://generativelanguage.googleapis.com/v1beta/models/"
                   "{{ $env.GEMINI_MODEL || 'gemini-2.5-flash-lite' }}:generateContent",
            "sendHeaders": True,
            "headerParameters": {
                "parameters": [{"name": "x-goog-api-key", "value": "={{ $env.GEMINI_API_KEY }}"}]
            },
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": "={{ JSON.stringify($json.gemini_request) }}",
            "options": {"timeout": 60000},
        },
        "id": gerar_id(nome),
        "name": nome,
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": posicao,
        "retryOnFail": True,
        "maxTries": 3,
        "waitBetweenTries": 2000,
        "onError": "continueRegularOutput",
        "notes": notas,
        "notesInFlow": True,
    }


def criar_no_api(nome: str, url: str, posicao: list[int], notas: str) -> dict:
    return {
        "parameters": {
            "url": url,
            "sendHeaders": True,
            "headerParameters": {
                "parameters": [
                    {"name": "User-Agent", "value": "assistente-empresarial-n8n/1.0"},
                    {"name": "Accept", "value": "application/json"},
                ]
            },
            "options": {
                "timeout": 20000,
                "response": {"response": {"fullResponse": True, "neverError": True, "responseFormat": "json"}},
            },
        },
        "id": gerar_id(nome),
        "name": nome,
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": posicao,
        "onError": "continueRegularOutput",
        "notes": notas,
        "notesInFlow": True,
    }


def criar_no_if(nome: str, expressao: str, posicao: list[int], notas: str) -> dict:
    return {
        "parameters": {
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose", "version": 2},
                "conditions": [
                    {
                        "id": gerar_id(nome + "-cond"),
                        "leftValue": expressao,
                        "rightValue": "",
                        "operator": {"type": "boolean", "operation": "true", "singleValue": True},
                    }
                ],
                "combinator": "and",
            },
            "options": {},
        },
        "id": gerar_id(nome),
        "name": nome,
        "type": "n8n-nodes-base.if",
        "typeVersion": 2.2,
        "position": posicao,
        "notes": notas,
        "notesInFlow": True,
    }


def criar_regra_switch(valor: str, rotulo: str) -> dict:
    return {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
            "conditions": [
                {
                    "id": gerar_id("switch-" + valor),
                    "leftValue": "={{ $json.rota }}",
                    "rightValue": valor,
                    "operator": {"type": "string", "operation": "equals"},
                }
            ],
            "combinator": "and",
        },
        "renameOutput": True,
        "outputKey": rotulo,
    }


def criar_nota_adesiva(nome: str, conteudo: str, posicao: list[int], largura: int, altura: int, cor: int) -> dict:
    return {
        "parameters": {"content": conteudo, "height": altura, "width": largura, "color": cor},
        "id": gerar_id(nome),
        "name": nome,
        "type": "n8n-nodes-base.stickyNote",
        "typeVersion": 1,
        "position": posicao,
    }


def montar_workflow() -> dict:
    nos = [
        criar_nota_adesiva(
            "Nota - Visao Geral",
            "## Assistente de Consultas Empresariais (CNPJ e Câmbio)\n"
            "Fluxo integrando Gemini + BrasilAPI + AwesomeAPI.\n\n"
            "**Entradas:** Webhook (`POST /webhook/assistente-empresarial`) ou Chat do n8n.\n"
            "**Saída:** JSON estruturado + texto em Markdown.\n\n"
            "Variáveis de ambiente: `GEMINI_API_KEY`, `GEMINI_MODEL`.",
            [-420, -60], 380, 300, 7,
        ),
        criar_nota_adesiva(
            "Nota - Etapa 1",
            "### 1. Entrada e validação\nLimpa a string recebida, gera o `request_id` e barra entradas vazias antes de chamar o Gemini.",
            [-40, -60], 660, 600, 5,
        ),
        criar_nota_adesiva(
            "Nota - Etapa 2",
            "### 2. Classificador de intenção (Prompt 1)\nGemini com `temperature: 0` e JSON Schema extrai a intenção e parâmetros. "
            "O nó seguinte valida dígitos verificadores do CNPJ e moeda.",
            [640, -60], 900, 600, 4,
        ),
        criar_nota_adesiva(
            "Nota - Etapa 3",
            "### 3. Consulta às APIs externas\nBrasilAPI (dados da Receita Federal) ou AwesomeAPI (histórico de câmbio). "
            "Cálculos de variação, volatilidade e regras de risco são feitos em código.",
            [1560, -200], 660, 740, 6,
        ),
        criar_nota_adesiva(
            "Nota - Etapa 4",
            "### 4. Geração de análise (Prompt 2)\nGemini recebe os dados limpos e métricas calculadas para montar o parecer em JSON e Markdown.",
            [2240, -200], 900, 740, 3,
        ),

        {
            "parameters": {
                "httpMethod": "POST",
                "path": "assistente-empresarial",
                "responseMode": "responseNode",
                "options": {"allowedOrigins": "*"},
            },
            "id": gerar_id("Webhook - API"),
            "name": "Webhook - API",
            "type": "n8n-nodes-base.webhook",
            "typeVersion": 2,
            "position": [0, 120],
            "webhookId": gerar_id("webhook-api"),
            "notes": "POST {\"mensagem\": \"...\"}",
            "notesInFlow": True,
        },
        {
            "parameters": {
                "public": True,
                "mode": "hostedChat",
                "initialMessages": "Olá! Sou o assistente de consultas de CNPJ e câmbio.\n"
                                   "Envie o CNPJ de uma empresa ou pergunte sobre a cotação de uma moeda.",
                "options": {
                    "responseMode": "responseNode",
                    "title": "Assistente de Consultas (CNPJ e Câmbio)",
                    "subtitle": "Integração Gemini + BrasilAPI + AwesomeAPI",
                    "inputPlaceholder": "Ex: Analise o CNPJ 00.000.000/0001-91",
                    "loadPreviousSession": "notSupported",
                },
            },
            "id": gerar_id("Chat - Interface"),
            "name": "Chat - Interface",
            "type": "@n8n/n8n-nodes-langchain.chatTrigger",
            "typeVersion": 1.1,
            "position": [0, 340],
            "webhookId": gerar_id("webhook-chat"),
            "notes": "Chat hospedado do n8n",
            "notesInFlow": True,
        },

        criar_no_codigo("Validar Entrada", ler_texto(PASTA_SRC / "01_validar_entrada.js"), [220, 230],
                        "Normaliza e valida a mensagem"),
        criar_no_if("Entrada valida?", "={{ $json.valido }}", [440, 230], "Barra vazias antes do LLM"),

        criar_no_codigo(
            "Preparar Prompt - Classificador",
            injetar_prompt("02_preparar_classificador.js", "01_classificador_system.md", "01_classificador_schema.json"),
            [680, 120], "System prompt + few-shot + schema",
        ),
        criar_no_gemini("Gemini - Classificar Intencao", [900, 120], "temperature 0 - JSON mode"),
        criar_no_codigo("Validar Classificacao", ler_texto(PASTA_SRC / "03_validar_classificacao.js"), [1120, 120],
                        "Valida CNPJ/moeda e define rota"),
        {
            "parameters": {
                "rules": {"values": [criar_regra_switch("cnpj", "CNPJ"), criar_regra_switch("cotacao", "Cotacao")]},
                "options": {"fallbackOutput": "extra", "renameFallbackOutput": "Sem consulta"},
            },
            "id": gerar_id("Rotear por Intencao"),
            "name": "Rotear por Intencao",
            "type": "n8n-nodes-base.switch",
            "typeVersion": 3.2,
            "position": [1340, 120],
            "notes": "cnpj / cotacao / direta",
            "notesInFlow": True,
        },

        criar_no_api(
            "BrasilAPI - Consultar CNPJ",
            "=https://brasilapi.com.br/api/cnpj/v1/{{ $json.parametros.cnpj }}",
            [1640, -40], "GET /api/cnpj/v1/{cnpj}",
        ),
        criar_no_api(
            "AwesomeAPI - Consultar Cotacao",
            "=https://economia.awesomeapi.com.br/json/daily/{{ $json.parametros.moeda }}-BRL/"
            "{{ Math.max($json.parametros.periodo_dias, 2) }}",
            [1640, 180], "GET /json/daily/{moeda}-BRL/{dias}",
        ),
        criar_no_codigo("Normalizar Dados - CNPJ", ler_texto(PASTA_SRC / "04a_normalizar_cnpj.js"), [1860, -40],
                        "Campos úteis + métricas + regras"),
        criar_no_codigo("Normalizar Dados - Cotacao", ler_texto(PASTA_SRC / "04b_normalizar_cotacao.js"), [1860, 180],
                        "Variação, volatilidade, conversão"),
        criar_no_if("Dados obtidos?", "={{ !$json.resposta_direta }}", [2080, 70], "404 / erro -> resposta direta"),

        criar_no_codigo(
            "Preparar Prompt - Analista",
            injetar_prompt("05_preparar_analista.js", "02_analista_system.md", "02_analista_schema.json"),
            [2300, -40], "Dados + métricas + sinais",
        ),
        criar_no_gemini("Gemini - Gerar Insights", [2520, -40], "temperature 0.2 - JSON mode"),
        criar_no_codigo("Montar Resposta Final", ler_texto(PASTA_SRC / "06_montar_resposta.js"), [2740, -40],
                        "Guardrails + envelope JSON"),
        criar_no_codigo("Montar Resposta Direta", ler_texto(PASTA_SRC / "07_resposta_direta.js"), [2740, 340],
                        "Erros, escopo e esclarecimentos"),
        {
            "parameters": {
                "respondWith": "json",
                "responseBody": "={{ $json.body }}",
                "options": {"responseCode": "={{ $json.http_status }}"},
            },
            "id": gerar_id("Responder"),
            "name": "Responder",
            "type": "n8n-nodes-base.respondToWebhook",
            "typeVersion": 1.1,
            "position": [2980, 150],
            "notes": "HTTP status dinâmico",
            "notesInFlow": True,
        },
    ]

    def conectar(*grupos_destino):
        return [[{"node": destino, "type": "main", "index": 0} for destino in grupo] for grupo in grupos_destino]

    conexoes = {
        "Webhook - API": {"main": conectar(["Validar Entrada"])},
        "Chat - Interface": {"main": conectar(["Validar Entrada"])},
        "Validar Entrada": {"main": conectar(["Entrada valida?"])},
        "Entrada valida?": {"main": conectar(["Preparar Prompt - Classificador"], ["Montar Resposta Direta"])},
        "Preparar Prompt - Classificador": {"main": conectar(["Gemini - Classificar Intencao"])},
        "Gemini - Classificar Intencao": {"main": conectar(["Validar Classificacao"])},
        "Validar Classificacao": {"main": conectar(["Rotear por Intencao"])},
        "Rotear por Intencao": {"main": conectar(["BrasilAPI - Consultar CNPJ"], ["AwesomeAPI - Consultar Cotacao"],
                                                 ["Montar Resposta Direta"])},
        "BrasilAPI - Consultar CNPJ": {"main": conectar(["Normalizar Dados - CNPJ"])},
        "AwesomeAPI - Consultar Cotacao": {"main": conectar(["Normalizar Dados - Cotacao"])},
        "Normalizar Dados - CNPJ": {"main": conectar(["Dados obtidos?"])},
        "Normalizar Dados - Cotacao": {"main": conectar(["Dados obtidos?"])},
        "Dados obtidos?": {"main": conectar(["Preparar Prompt - Analista"], ["Montar Resposta Direta"])},
        "Preparar Prompt - Analista": {"main": conectar(["Gemini - Gerar Insights"])},
        "Gemini - Gerar Insights": {"main": conectar(["Montar Resposta Final"])},
        "Montar Resposta Final": {"main": conectar(["Responder"])},
        "Montar Resposta Direta": {"main": conectar(["Responder"])},
    }

    return {
        "id": "AssistenteEmpresarialIA",
        "name": "Assistente de Consultas Empresariais (Gemini + BrasilAPI + AwesomeAPI)",
        "nodes": nos,
        "connections": conexoes,
        "active": True,
        "settings": {"executionOrder": "v1", "saveManualExecutions": True},
        "pinData": {},
        "tags": [],
        "meta": {"templateCredsSetupCompleted": True},
    }


if __name__ == "__main__":
    fluxo = montar_workflow()
    ARQUIVO_SAIDA.write_text(json.dumps(fluxo, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Workflow atualizado em {ARQUIVO_SAIDA.relative_to(RAIZ)} ({len(fluxo['nodes'])} nos)")
