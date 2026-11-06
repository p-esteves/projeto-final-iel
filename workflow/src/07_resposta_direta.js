// Formata a saída para os casos em que não há chamada às APIs externas ou ao segundo prompt
// (entrada inválida, fora de escopo, pedido de esclarecimento, CNPJ inválido ou erro de API).
const ctx = $input.first().json;
const r = ctx.resposta_direta ?? {
  http_status: 500, status: 'erro', tipo: 'erro_interno', mensagem: 'Erro interno inesperado.',
};

let markdown = r.mensagem;
if (Array.isArray(r.exemplos) && r.exemplos.length) {
  markdown += `\n\n**Exemplos do que você pode perguntar:**\n${r.exemplos.map((e) => `- ${e}`).join('\n')}`;
}

const usoC = ctx.uso_tokens_classificador ?? null;

const body = {
  status: r.status,
  request_id: ctx.request_id,
  tipo: r.tipo,
  intencao: ctx.classificacao?.intencao ?? null,
  parametros: ctx.parametros ?? null,
  mensagem: r.mensagem,
  output: markdown,
  metadados: {
    origem: ctx.origem,
    raciocinio_classificador: ctx.classificacao?.raciocinio ?? null,
    confianca_classificacao: ctx.classificacao?.confianca ?? null,
    detalhe_tecnico: r.detalhe_tecnico ?? null,
    tokens: usoC
      ? { classificador: { entrada: usoC.promptTokenCount ?? null, saida: usoC.candidatesTokenCount ?? null }, analista: null }
      : null,
    latencia_ms: ctx.t0 ? Date.now() - ctx.t0 : null,
    respondido_em: new Date().toISOString(),
  },
};

return [{ json: { http_status: r.http_status, body } }];
