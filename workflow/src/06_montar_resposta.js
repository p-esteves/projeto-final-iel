// Valida o JSON de análise retornado pelo Gemini, garante que o nível de risco
// não fique abaixo do piso definido pelas regras e monta a resposta final.
const ctx = { ...$('Preparar Prompt - Analista').first().json };
delete ctx.gemini_request;
const resp = $input.first().json;

const NIVEIS = ['baixo', 'moderado', 'alto'];
const IMPACTOS = ['positivo', 'neutro', 'atencao', 'critico'];
const guardrails = [];

function extrairJsonGemini(r) {
  if (r.error) throw new Error(`Erro na chamada ao Gemini: ${r.error.message ?? JSON.stringify(r.error)}`);
  const cand = r.candidates?.[0];
  if (!cand) throw new Error('Gemini não retornou candidatos.');
  const texto = (cand.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join('').trim();
  if (!texto) throw new Error(`Resposta vazia (finishReason: ${cand.finishReason}).`);
  return JSON.parse(texto.replace(/^```(?:json)?\s*|\s*```$/g, ''));
}

function validarAnalise(a) {
  const faltando = ['titulo', 'resumo_executivo', 'insights', 'alertas', 'nivel_risco', 'recomendacao', 'resposta_formatada']
    .filter((c) => a[c] === undefined || a[c] === null || a[c] === '');
  if (faltando.length) throw new Error(`Campos ausentes na análise: ${faltando.join(', ')}`);
  if (!Array.isArray(a.insights) || a.insights.length === 0) throw new Error('Lista de insights vazia.');
  if (!NIVEIS.includes(a.nivel_risco)) throw new Error(`nivel_risco inválido: ${a.nivel_risco}`);
  a.insights = a.insights.map((i) => ({ ...i, impacto: IMPACTOS.includes(i.impacto) ? i.impacto : 'neutro' }));
  return a;
}

const pisoRisco = ctx.sinais.some((s) => s.severidade === 'alta') ? 'alto'
  : ctx.sinais.some((s) => s.severidade === 'media') ? 'moderado' : 'baixo';

let analise = null;
let status = 'sucesso';
let erroLLM = null;

try {
  analise = validarAnalise(extrairJsonGemini(resp));

  if (NIVEIS.indexOf(analise.nivel_risco) < NIVEIS.indexOf(pisoRisco)) {
    guardrails.push(`nivel_risco ajustado de "${analise.nivel_risco}" para "${pisoRisco}" pelas regras de negócio`);
    analise.nivel_risco = pisoRisco;
  }
  const sinaisAltos = ctx.sinais.filter((s) => s.severidade === 'alta');
  if (sinaisAltos.length && analise.alertas.length === 0) {
    analise.alertas = sinaisAltos.map((s) => s.descricao);
    guardrails.push('alertas obrigatórios inseridos a partir das regras de negócio');
  }
  if (analise.resposta_formatada.length > 2500) {
    analise.resposta_formatada = `${analise.resposta_formatada.slice(0, 2500)}...`;
    guardrails.push('resposta_formatada truncada (limite de 2500 caracteres)');
  }
} catch (e) {
  status = 'parcial';
  erroLLM = e.message;
  const m = ctx.metricas;
  const resumo = ctx.classificacao.intencao === 'consulta_cnpj'
    ? `${ctx.dados.razao_social}: situação ${ctx.dados.situacao_cadastral}, ${m.idade_empresa_anos} anos de atividade.`
    : `${ctx.dados.par}: compra R$ ${m.cotacao_atual_compra}, variação de ${m.variacao_periodo_percentual}% em ${m.pontos_na_serie} pontos.`;
  analise = {
    titulo: 'Dados obtidos (análise de IA indisponível)',
    resumo_executivo: resumo,
    insights: ctx.sinais.map((s) => ({ categoria: s.regra, descricao: s.descricao, impacto: s.severidade === 'alta' ? 'critico' : 'atencao' })),
    alertas: ctx.sinais.map((s) => s.descricao),
    nivel_risco: pisoRisco,
    recomendacao: 'A camada de análise por IA falhou; revise os dados oficiais retornados em dados_fonte.',
    resposta_formatada: `**Dados obtidos (análise de IA indisponível)**\n\n${resumo}`,
  };
}

const usoC = ctx.uso_tokens_classificador ?? {};
const usoA = resp.usageMetadata ?? {};

const body = {
  status,
  request_id: ctx.request_id,
  intencao: ctx.classificacao.intencao,
  parametros: ctx.parametros,
  resposta: analise,
  output: analise.resposta_formatada,
  dados_fonte: {
    fonte: ctx.fonte.nome,
    url: ctx.fonte.url,
    dados: ctx.dados,
    metricas: ctx.metricas,
    sinais_regras: ctx.sinais,
  },
  metadados: {
    origem: ctx.origem,
    modelo: resp.modelVersion ?? null,
    raciocinio_classificador: ctx.classificacao.raciocinio,
    confianca_classificacao: ctx.classificacao.confianca,
    guardrails_aplicados: guardrails,
    erro_llm: erroLLM,
    tokens: {
      classificador: { entrada: usoC.promptTokenCount ?? null, saida: usoC.candidatesTokenCount ?? null },
      analista: { entrada: usoA.promptTokenCount ?? null, saida: usoA.candidatesTokenCount ?? null },
    },
    latencia_ms: Date.now() - ctx.t0,
    recebido_em: ctx.recebido_em,
    respondido_em: new Date().toISOString(),
  },
};

return [{ json: { http_status: 200, body } }];
