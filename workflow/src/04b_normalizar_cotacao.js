// Trata a série histórica da AwesomeAPI e calcula variação no período,
// volatilidade diária (desvio-padrão dos retornos), spread e conversão em BRL.
const ctx = $('Validar Classificacao').first().json;
const resp = $input.first().json;
const status = resp.statusCode ?? 0;
const { moeda, periodo_dias, valor_conversao } = ctx.parametros;
const FONTE = 'AwesomeAPI - Economia';
const URL_FONTE = `https://economia.awesomeapi.com.br/json/daily/${moeda}-BRL/${Math.max(periodo_dias, 2)}`;

const lista = Array.isArray(resp.body) ? resp.body : [];
if (status === 404 || (status === 200 && lista.length === 0)) {
  return [{ json: { ...ctx, resposta_direta: {
    http_status: 404, status: 'erro', tipo: 'nao_encontrado',
    mensagem: `Não há cotação disponível para o par ${moeda}/BRL na fonte consultada.`,
  } } }];
}
if (status !== 200) {
  return [{ json: { ...ctx, resposta_direta: {
    http_status: 502, status: 'erro', tipo: 'fonte_indisponivel',
    mensagem: 'A fonte de cotações (AwesomeAPI) está indisponível no momento. Tente novamente em alguns minutos.',
    detalhe_tecnico: `HTTP ${status}`,
  } } }];
}

const tz = 'America/Sao_Paulo';
const serie = lista
  .map((p) => ({
    ts: Number(p.timestamp),
    data: DateTime.fromSeconds(Number(p.timestamp)).setZone(tz).toFormat('dd/MM/yyyy'),
    compra: Number(p.bid),
    venda: Number(p.ask),
    maxima: Number(p.high),
    minima: Number(p.low),
  }))
  .sort((a, b) => a.ts - b.ts);

const r4 = (n) => Math.round(n * 10000) / 10000;
const r2 = (n) => Math.round(n * 100) / 100;
const atual = serie[serie.length - 1];
const inicial = serie[0];
const fechamentos = serie.map((p) => p.compra);

const retornos = fechamentos.slice(1).map((v, i) => ((v - fechamentos[i]) / fechamentos[i]) * 100);
const media = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
let volatilidade = null;
if (retornos.length >= 2) {
  const m = media(retornos);
  volatilidade = Math.sqrt(retornos.reduce((a, r) => a + (r - m) ** 2, 0) / (retornos.length - 1));
}

const variacaoPeriodo = serie.length >= 2 ? ((atual.compra - inicial.compra) / inicial.compra) * 100 : null;
const tendencia = variacaoPeriodo === null ? 'indefinida'
  : variacaoPeriodo > 0.5 ? 'alta' : variacaoPeriodo < -0.5 ? 'baixa' : 'estavel';

const dados = {
  par: `${moeda}/BRL`,
  nome: lista[0].name ?? `${moeda}/Real Brasileiro`,
  atualizado_em: lista[0].create_date ?? atual.data,
  cotacao_atual: { compra: atual.compra, venda: atual.venda },
  serie_historica: serie.map(({ ts, ...resto }) => resto),
};

const metricas = {
  periodo_solicitado_dias: periodo_dias,
  pontos_na_serie: serie.length,
  data_inicial: inicial.data,
  data_final: atual.data,
  cotacao_inicial_compra: inicial.compra,
  cotacao_atual_compra: atual.compra,
  cotacao_atual_venda: atual.venda,
  spread_percentual: r4(((atual.venda - atual.compra) / atual.compra) * 100),
  variacao_periodo_percentual: variacaoPeriodo === null ? null : r2(variacaoPeriodo),
  maxima_periodo: Math.max(...serie.map((p) => p.maxima)),
  minima_periodo: Math.min(...serie.map((p) => p.minima)),
  media_compra_periodo: r4(media(fechamentos)),
  volatilidade_diaria_percentual: volatilidade === null ? null : r2(volatilidade),
  tendencia,
};

if (valor_conversao) {
  metricas.conversao = {
    valor_origem: valor_conversao,
    moeda_origem: moeda,
    cotacao_utilizada: atual.venda,
    criterio: 'cotação de venda (ask), referência para quem precisa comprar a moeda estrangeira',
    valor_em_brl: r2(valor_conversao * atual.venda),
  };
}

const sinais = [];
const varAbs = Math.abs(variacaoPeriodo ?? 0);
if ((volatilidade ?? 0) >= 1 || varAbs >= 5) {
  sinais.push({ severidade: 'alta', regra: 'risco_cambial_alto',
    descricao: `Oscilação elevada no período (volatilidade diária ${metricas.volatilidade_diaria_percentual ?? 'n/d'}%, variação ${metricas.variacao_periodo_percentual ?? 'n/d'}%).` });
} else if ((volatilidade ?? 0) >= 0.5 || varAbs >= 2) {
  sinais.push({ severidade: 'media', regra: 'risco_cambial_moderado',
    descricao: `Oscilação moderada no período (volatilidade diária ${metricas.volatilidade_diaria_percentual ?? 'n/d'}%, variação ${metricas.variacao_periodo_percentual ?? 'n/d'}%).` });
}
if (serie.length < 3) {
  sinais.push({ severidade: 'baixa', regra: 'serie_curta', descricao: 'Série histórica curta: indicadores de tendência e volatilidade têm baixa representatividade.' });
}

return [{ json: { ...ctx, fonte: { nome: FONTE, url: URL_FONTE }, dados, metricas, sinais } }];
