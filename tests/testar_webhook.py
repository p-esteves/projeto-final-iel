"""
Script de teste das rotas do workflow no n8n via Webhook.
Lê os cenários de tests/casos_teste.json, envia cada mensagem via POST para
http://localhost:5678/webhook/assistente-empresarial e salva os retornos em evidencias/.

Como rodar:
  python tests/testar_webhook.py
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
ARQUIVO_CASOS = RAIZ / "tests" / "casos_teste.json"
PASTA_EVIDENCIAS = RAIZ / "evidencias"
URL_PADRAO = "http://localhost:5678/webhook/assistente-empresarial"


def enviar_mensagem(url: str, mensagem: str) -> tuple[int, dict, float]:
    # Envia o JSON com a mensagem para o webhook ativo no n8n e mede o tempo de resposta
    payload = json.dumps({"mensagem": mensagem}).encode("utf-8")
    requisicao = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    inicio = time.perf_counter()
    try:
        with urllib.request.urlopen(requisicao, timeout=120) as resposta:
            corpo, status_http = resposta.read(), resposta.status
    except urllib.error.HTTPError as erro:
        corpo, status_http = erro.read(), erro.code

    tempo_ms = (time.perf_counter() - inicio) * 1000
    try:
        return status_http, json.loads(corpo.decode("utf-8")), tempo_ms
    except json.JSONDecodeError:
        return status_http, {"retorno_bruto": corpo.decode("utf-8", "replace")}, tempo_ms


def executar() -> int:
    parser = argparse.ArgumentParser(description="Executa os casos de teste no webhook do n8n.")
    parser.add_argument("--url", default=URL_PADRAO, help="URL do webhook do n8n")
    parser.add_argument("--casos", nargs="*", help="Filtrar apenas IDs específicos (ex: CT01 CT04)")
    argumentos = parser.parse_args()

    casos = json.loads(ARQUIVO_CASOS.read_text(encoding="utf-8"))
    if argumentos.casos:
        casos = [c for c in casos if c["id"] in argumentos.casos]

    (PASTA_EVIDENCIAS / "respostas").mkdir(parents=True, exist_ok=True)
    linhas_tabela = []
    total_aprovados = 0

    for caso in casos:
        status_http, corpo, tempo_ms = enviar_mensagem(argumentos.url, caso["mensagem"])
        esperado = caso["esperado"]
        obtido = {
            "http_status": status_http,
            "status": corpo.get("status"),
            "intencao": corpo.get("intencao"),
        }
        passou = all(obtido[chave] == esperado[chave] for chave in esperado)
        if passou:
            total_aprovados += 1

        caminho_saida = PASTA_EVIDENCIAS / "respostas" / f"{caso['id']}.json"
        caminho_saida.write_text(
            json.dumps(
                {
                    "caso": caso,
                    "http_status": status_http,
                    "latencia_ms": round(tempo_ms),
                    "resposta": corpo,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

        # Pequena pausa entre chamadas para respeitar o limite da camada gratuita do Gemini
        time.sleep(2)

        resultado_str = "APROVADO" if passou else "FALHOU"
        print(f"[{resultado_str}] {caso['id']} (HTTP {status_http}) {obtido['intencao']} - {round(tempo_ms)} ms - {caso['descricao']}")

        nivel_risco = (corpo.get("resposta") or {}).get("nivel_risco", "-")
        qtd_guardrails = len((corpo.get("metadados") or {}).get("guardrails_aplicados") or [])
        linhas_tabela.append(
            f"| {caso['id']} | {caso['descricao']} | `{esperado['intencao']}` / {esperado['http_status']} | "
            f"`{obtido['intencao']}` / {status_http} | {corpo.get('status')} | {nivel_risco} | "
            f"{qtd_guardrails} | {round(tempo_ms)} | {resultado_str} |"
        )

    total = len(casos)
    relatorio = [
        "# Relatório de Testes Ponta a Ponta",
        "",
        f"- **Executado em:** {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}",
        f"- **Endpoint:** `{argumentos.url}`",
        f"- **Resultado:** {total_aprovados}/{total} casos aprovados ({total_aprovados / max(total, 1):.0%})",
        "",
        "| ID | Cenário | Esperado (intenção / HTTP) | Obtido (intenção / HTTP) | Status | Risco | Guardrails | Latência (ms) | OK |",
        "|---|---|---|---|---|---|---|---|---|",
        *linhas_tabela,
        "",
        "As respostas completas de cada caso estão em [`respostas/`](respostas/).",
        "",
    ]
    (PASTA_EVIDENCIAS / "relatorio_testes.md").write_text("\n".join(relatorio), encoding="utf-8")
    print(f"\nResumo: {total_aprovados}/{total} aprovados. Relatório salvo em evidencias/relatorio_testes.md")
    return 0 if total_aprovados == total else 1


if __name__ == "__main__":
    sys.exit(executar())
