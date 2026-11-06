// Trata o retorno da BrasilAPI, separa apenas os campos necessários para a análise
// e calcula métricas e sinais de alerta (situação cadastral, tempo de abertura, capital social).
const ctx = $('Validar Classificacao').first().json;
const resp = $input.first().json;
const status = resp.statusCode ?? 0;
const FONTE = 'BrasilAPI - Receita Federal';
const URL_FONTE = `https://brasilapi.com.br/api/cnpj/v1/${ctx.parametros.cnpj}`;

if (status === 404 || status === 400) {
  return [{ json: { ...ctx, resposta_direta: {
    http_status: 404, status: 'erro', tipo: 'nao_encontrado',
    mensagem: `Não encontrei nenhuma empresa com o CNPJ ${ctx.parametros.cnpj} na base pública da Receita Federal. Verifique se o número está correto.`,
  } } }];
}
if (status !== 200 || typeof resp.body !== 'object') {
  return [{ json: { ...ctx, resposta_direta: {
    http_status: 502, status: 'erro', tipo: 'fonte_indisponivel',
    mensagem: 'A fonte de dados cadastrais (BrasilAPI) está indisponível no momento. Tente novamente em alguns minutos.',
    detalhe_tecnico: `HTTP ${status}`,
  } } }];
}

const d = resp.body;
const hoje = $now.setZone('America/Sao_Paulo');
const anosDesde = (iso) => (iso ? Math.round(hoje.diff(DateTime.fromISO(iso), 'years').years * 10) / 10 : null);
const fmtData = (iso) => (iso ? DateTime.fromISO(iso).toFormat('dd/MM/yyyy') : null);
const fmtCnpj = (c) => c.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5');

const regimes = Array.isArray(d.regime_tributario) ? [...d.regime_tributario].sort((a, b) => b.ano - a.ano) : [];
const socios = Array.isArray(d.qsa) ? d.qsa : [];

const dados = {
  cnpj: fmtCnpj(d.cnpj),
  razao_social: d.razao_social,
  nome_fantasia: d.nome_fantasia || null,
  matriz_filial: d.descricao_identificador_matriz_filial,
  situacao_cadastral: d.descricao_situacao_cadastral,
  data_situacao_cadastral: fmtData(d.data_situacao_cadastral),
  motivo_situacao: d.descricao_motivo_situacao_cadastral,
  situacao_especial: d.situacao_especial || null,
  data_inicio_atividade: fmtData(d.data_inicio_atividade),
  porte: d.porte,
  natureza_juridica: d.natureza_juridica,
  capital_social: d.capital_social,
  atividade_principal: { cnae: d.cnae_fiscal, descricao: d.cnae_fiscal_descricao },
  atividades_secundarias: (d.cnaes_secundarios ?? []).filter((c) => c.codigo).slice(0, 5)
    .map((c) => ({ cnae: c.codigo, descricao: c.descricao })),
  localizacao: { municipio: d.municipio, uf: d.uf, bairro: d.bairro },
  opcao_simples_nacional: d.opcao_pelo_simples,
  opcao_mei: d.opcao_pelo_mei,
  regime_tributario_mais_recente: regimes[0]
    ? { ano: regimes[0].ano, forma: regimes[0].forma_de_tributacao } : null,
  socios_principais: socios.slice(0, 5).map((s) => ({
    nome: s.nome_socio, qualificacao: s.qualificacao_socio, desde: fmtData(s.data_entrada_sociedade),
  })),
};

const metricas = {
  idade_empresa_anos: anosDesde(d.data_inicio_atividade),
  anos_na_situacao_atual: anosDesde(d.data_situacao_cadastral),
  total_socios: socios.length,
  total_atividades_secundarias: (d.cnaes_secundarios ?? []).filter((c) => c.codigo).length,
};

const sinais = [];
if (d.descricao_situacao_cadastral !== 'ATIVA') {
  sinais.push({ severidade: 'alta', regra: 'situacao_nao_ativa',
    descricao: `Situação cadastral ${d.descricao_situacao_cadastral} (motivo: ${d.descricao_motivo_situacao_cadastral || 'não informado'}).` });
}
if (d.situacao_especial) {
  sinais.push({ severidade: 'alta', regra: 'situacao_especial', descricao: `Situação especial registrada: ${d.situacao_especial}.` });
}
if (metricas.idade_empresa_anos !== null && metricas.idade_empresa_anos < 1) {
  sinais.push({ severidade: 'media', regra: 'empresa_recente', descricao: 'Empresa com menos de 1 ano de atividade.' });
} else if (metricas.idade_empresa_anos !== null && metricas.idade_empresa_anos < 2) {
  sinais.push({ severidade: 'media', regra: 'empresa_jovem', descricao: 'Empresa com menos de 2 anos de atividade.' });
}
if (!d.opcao_pelo_mei && typeof d.capital_social === 'number' && d.capital_social < 1000) {
  sinais.push({ severidade: 'media', regra: 'capital_baixo', descricao: `Capital social declarado muito baixo (R$ ${d.capital_social}).` });
}
if (d.opcao_pelo_mei) {
  sinais.push({ severidade: 'baixa', regra: 'mei', descricao: 'Empresa enquadrada como MEI, sujeita a limite anual de faturamento.' });
}
if (socios.length === 0 && !d.opcao_pelo_mei) {
  sinais.push({ severidade: 'baixa', regra: 'qsa_vazio', descricao: 'Quadro societário não informado na fonte.' });
}

return [{ json: { ...ctx, fonte: { nome: FONTE, url: URL_FONTE }, dados, metricas, sinais } }];
