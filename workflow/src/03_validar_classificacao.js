// Faz o parse do JSON retornado pelo classificador e valida os parâmetros extraídos
// (dígitos verificadores do CNPJ pelo módulo 11 e código ISO da moeda).
const ctx = { ...$('Preparar Prompt - Classificador').first().json };
delete ctx.gemini_request;
const resp = $input.first().json;

const MOEDAS_SUPORTADAS = ['USD', 'EUR', 'GBP', 'ARS', 'JPY', 'CNY', 'CHF', 'CAD', 'AUD', 'BTC'];
const LIMIAR_CONFIANCA = 0.5;

const MSG_CAPACIDADES =
  'Posso ajudar com duas consultas: **(1) análise cadastral de empresas pelo CNPJ** ' +
  '(situação na Receita Federal, tempo de atividade, porte, sócios e sinais de risco) e ' +
  '**(2) cotação de moedas estrangeiras em reais** (cotação atual, tendência, volatilidade e conversão de valores).';

const EXEMPLOS = [
  'Analise o fornecedor de CNPJ 00.000.000/0001-91',
  'Como o dólar se comportou nos últimos 15 dias?',
  'Quanto ficam 3.000 euros em reais hoje?',
];

function extrairJsonGemini(r) {
  if (r.error) throw new Error(`Erro na chamada ao Gemini: ${r.error.message ?? JSON.stringify(r.error)}`);
  const cand = r.candidates?.[0];
  if (!cand) throw new Error(`Gemini não retornou candidatos (${r.promptFeedback?.blockReason ?? 'motivo desconhecido'}).`);
  const texto = (cand.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join('').trim();
  if (!texto) throw new Error(`Resposta vazia do Gemini (finishReason: ${cand.finishReason}).`);
  return JSON.parse(texto.replace(/^```(?:json)?\s*|\s*```$/g, ''));
}

// Cálculo dos dois dígitos verificadores do CNPJ (módulo 11 - Receita Federal)
function cnpjValido(cnpj) {
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(cnpj)) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  const valores = [...cnpj].map((c) => c.charCodeAt(0) - 48);
  const dv = (n) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((acc, p, i) => acc + p * valores[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return dv(12) === valores[12] && dv(13) === valores[13];
}

function respostaDireta(http_status, status, tipo, mensagem, extra = {}) {
  return { http_status, status, tipo, mensagem, ...extra };
}

let classificacao;
try {
  classificacao = extrairJsonGemini(resp);
} catch (e) {
  return [{
    json: {
      ...ctx,
      rota: 'direta',
      resposta_direta: respostaDireta(502, 'erro', 'falha_classificador',
        'Não foi possível interpretar sua solicitação no momento. Tente novamente em instantes.',
        { detalhe_tecnico: e.message }),
    },
  }];
}

const saida = { ...ctx, classificacao, uso_tokens_classificador: resp.usageMetadata ?? null };
const intencao = classificacao.intencao;

if (intencao === 'fora_escopo') {
  saida.rota = 'direta';
  saida.resposta_direta = respostaDireta(200, 'sem_consulta', 'fora_escopo',
    `Essa solicitação está fora do meu escopo. ${MSG_CAPACIDADES}`, { exemplos: EXEMPLOS });
} else if (intencao === 'esclarecimento_necessario' || (classificacao.confianca ?? 0) < LIMIAR_CONFIANCA) {
  saida.rota = 'direta';
  saida.resposta_direta = respostaDireta(200, 'sem_consulta', 'esclarecimento',
    classificacao.pergunta_esclarecimento || `Não consegui entender exatamente o que você precisa. ${MSG_CAPACIDADES}`,
    { exemplos: EXEMPLOS });
} else if (intencao === 'consulta_cnpj') {
  const cnpj = String(classificacao.cnpj ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cnpjValido(cnpj)) {
    saida.rota = 'direta';
    saida.resposta_direta = respostaDireta(422, 'erro', 'parametro_invalido',
      `O CNPJ informado (${classificacao.cnpj ?? 'vazio'}) não é válido: ele deve ter 14 caracteres e dígitos verificadores corretos. Confira o número e envie novamente.`);
  } else {
    saida.rota = 'cnpj';
    saida.parametros = { cnpj };
  }
} else if (intencao === 'cotacao_moeda') {
  const moeda = String(classificacao.moeda ?? '').toUpperCase().trim();
  if (!MOEDAS_SUPORTADAS.includes(moeda)) {
    saida.rota = 'direta';
    saida.resposta_direta = respostaDireta(422, 'erro', 'parametro_invalido',
      `A moeda "${classificacao.moeda ?? 'não identificada'}" não é suportada. Moedas disponíveis: ${MOEDAS_SUPORTADAS.join(', ')}.`);
  } else {
    const dias = Number.isInteger(classificacao.periodo_dias) ? classificacao.periodo_dias : 7;
    const valor = Number(classificacao.valor_conversao);
    saida.rota = 'cotacao';
    saida.parametros = {
      moeda,
      periodo_dias: Math.min(30, Math.max(1, dias)),
      valor_conversao: Number.isFinite(valor) && valor > 0 ? valor : null,
    };
  }
} else {
  saida.rota = 'direta';
  saida.resposta_direta = respostaDireta(502, 'erro', 'falha_classificador',
    'O classificador retornou uma intenção desconhecida.', { detalhe_tecnico: `intencao=${intencao}` });
}

return [{ json: saida }];
