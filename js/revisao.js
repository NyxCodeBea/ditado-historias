// ============================================================
// revisao.js — FASE 2 (ainda desligada).
// Estrutura para o botão "Revisar gramática": manda o texto para
// uma IA, recebe sugestões e deixa você aceitar ou recusar cada uma.
//
// Para ligar no futuro:
//   1. Implementar `pedirSugestoes` chamando o serviço de IA escolhido.
//      (Atenção: uma chave de API não pode ficar no código público do
//       GitHub Pages. Será preciso um pequeno servidor intermediário
//       ou digitar a chave nas Configurações, guardada só no celular.)
//   2. Mudar REVISAO_DISPONIVEL para true.
// ============================================================

export const REVISAO_DISPONIVEL = false;

/**
 * Formato de cada sugestão:
 * {
 *   inicio: number,     // posição inicial no texto original
 *   fim: number,        // posição final (exclusiva)
 *   original: string,   // trecho atual
 *   sugestao: string,   // trecho corrigido
 *   motivo: string,     // explicação curta ("concordância", "vírgula"...)
 * }
 */

/** Pede sugestões à IA. Na fase 1 não faz nada. */
export async function pedirSugestoes(texto, opcoes = {}) {
  void texto; void opcoes;
  // FASE 2: chamar a IA aqui. Pedir para devolver JSON no formato acima
  // e informar que nomes do dicionário (opcoes.nomesProtegidos) não podem mudar.
  return [];
}

/**
 * Aplica as sugestões aceitas ao texto. Aplica de trás para frente
 * para que as posições continuem válidas. Ignora sugestões sobrepostas.
 */
export function aplicarSugestoes(texto, aceitas) {
  const ordenadas = [...aceitas].sort((a, b) => b.inicio - a.inicio);
  let resultado = texto;
  let limite = Infinity;
  for (const s of ordenadas) {
    if (s.fim > limite || s.inicio < 0 || s.fim > texto.length || s.inicio > s.fim) continue;
    resultado = resultado.slice(0, s.inicio) + s.sugestao + resultado.slice(s.fim);
    limite = s.inicio;
  }
  return resultado;
}
