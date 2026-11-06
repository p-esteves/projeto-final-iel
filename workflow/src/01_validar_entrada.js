// Normaliza a entrada vinda do Webhook (campo body.mensagem) ou do Chat Trigger
// (campo chatInput) e barra mensagens vazias ou grandes demais antes de chamar o Gemini.
const item = $input.first().json;
const t0 = Date.now();

const requestId = `req_${t0.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const origem = item.chatInput !== undefined ? 'chat' : 'api';
const bruto = origem === 'chat' ? item.chatInput : item.body?.mensagem;

let mensagem = typeof bruto === 'string' ? bruto : '';
mensagem = mensagem
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  .replace(/<\/?mensagem_usuario>/gi, '') // evita fechar a tag XML do prompt
  .replace(/\s+/g, ' ')
  .trim();

const erros = [];
if (!mensagem) {
  erros.push('O campo "mensagem" é obrigatório e deve conter texto.');
} else if (mensagem.length < 3) {
  erros.push('A mensagem é curta demais para ser interpretada (mínimo de 3 caracteres).');
} else if (mensagem.length > 1000) {
  erros.push('A mensagem excede o limite de 1000 caracteres.');
}

const saida = {
  valido: erros.length === 0,
  request_id: requestId,
  origem,
  session_id: item.sessionId ?? null,
  recebido_em: new Date(t0).toISOString(),
  t0,
  mensagem,
};

if (!saida.valido) {
  saida.resposta_direta = {
    http_status: 400,
    status: 'erro',
    tipo: 'entrada_invalida',
    mensagem: erros.join(' '),
  };
}

return [{ json: saida }];
