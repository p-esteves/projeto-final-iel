// Monta o prompt da segunda chamada ao Gemini (Analista), enviando os dados da API,
// as métricas já calculadas e os sinais de alerta identificados pelas regras.
const SYSTEM_PROMPT = __SYSTEM_PROMPT__;
const RESPONSE_SCHEMA = __RESPONSE_SCHEMA__;

const ctx = $input.first().json;
const tipo = ctx.classificacao.intencao;
const dataAtual = $now.setZone('America/Sao_Paulo').toFormat('dd/MM/yyyy');

const dadosParaLLM = { ...ctx.dados };
if (tipo === 'cotacao_moeda') {
  dadosParaLLM.serie_historica = ctx.dados.serie_historica.map((p) => `${p.data}: ${p.compra}`);
}

const userPrompt = [
  `<data_referencia>${dataAtual}</data_referencia>`,
  `<pergunta_usuario>\n${ctx.mensagem}\n</pergunta_usuario>`,
  `<tipo_consulta>${tipo}</tipo_consulta>`,
  `<fonte>${ctx.fonte.nome}</fonte>`,
  `<dados_api>\n${JSON.stringify(dadosParaLLM, null, 1)}\n</dados_api>`,
  `<metricas_calculadas>\n${JSON.stringify(ctx.metricas, null, 1)}\n</metricas_calculadas>`,
  `<sinais_regras>\n${JSON.stringify(ctx.sinais, null, 1)}\n</sinais_regras>`,
].join('\n\n');

const gemini_request = {
  systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
  contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
  generationConfig: {
    temperature: 0.2,
    responseMimeType: 'application/json',
    responseSchema: RESPONSE_SCHEMA,
    maxOutputTokens: 4096,
    __THINKING_CONFIG__
  },
};

return [{ json: { ...ctx, gemini_request } }];
