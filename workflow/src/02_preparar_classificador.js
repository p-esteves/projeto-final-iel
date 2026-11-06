// Monta o payload da primeira chamada ao Gemini (classificação de intenção e extração).
const SYSTEM_PROMPT = __SYSTEM_PROMPT__;
const RESPONSE_SCHEMA = __RESPONSE_SCHEMA__;

const entrada = $input.first().json;
const dataAtual = $now.setZone('America/Sao_Paulo').toFormat('dd/MM/yyyy');

const gemini_request = {
  systemInstruction: {
    parts: [{ text: SYSTEM_PROMPT.replace('{{DATA_ATUAL}}', dataAtual) }],
  },
  contents: [
    {
      role: 'user',
      parts: [{ text: `<mensagem_usuario>\n${entrada.mensagem}\n</mensagem_usuario>` }],
    },
  ],
  generationConfig: {
    temperature: 0,
    responseMimeType: 'application/json',
    responseSchema: RESPONSE_SCHEMA,
    maxOutputTokens: 1024,
    __THINKING_CONFIG__
  },
};

return [{ json: { ...entrada, gemini_request } }];
