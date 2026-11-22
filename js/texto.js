// ============================================================
// texto.js — Lógica pura de texto (sem DOM, sem IA).
// Troca de códigos (insígnias), comandos falados de pontuação,
// maiúsculas automáticas e espaçamento correto.
// Este arquivo é testado em testes/testes.js.
// ============================================================

export const CATEGORIAS = [
  { id: 'personagem', nome: 'Personagem' },
  { id: 'lugar', nome: 'Lugar' },
  { id: 'termo', nome: 'Termo' },
  { id: 'outro', nome: 'Outro' },
];

// Nomes falados das letras (já normalizados: minúsculos e sem acento).
const NOMES_LETRAS = {
  a: [], b: ['be'], c: ['ce'], d: ['de'], e: [], f: ['efe'], g: ['ge'],
  h: ['aga'], i: [], j: ['jota'], k: ['ka', 'capa'], l: ['ele', 'el'],
  m: ['eme'], n: ['ene'], o: [], p: ['pe'], q: ['que'], r: ['erre'],
  s: ['esse'], t: ['te'], u: [], v: ['ve'], w: ['dablio', 'dabliu'],
  x: ['xis'], y: ['ipsilon'], z: ['ze'],
};

// Números falados (para gerar variações automáticas como "dois L").
const NOMES_NUMEROS = {
  0: ['zero'], 1: ['um', 'uma'], 2: ['dois', 'duas'], 3: ['tres'], 4: ['quatro'],
  5: ['cinco'], 6: ['seis'], 7: ['sete'], 8: ['oito'], 9: ['nove'], 10: ['dez'],
  11: ['onze'], 12: ['doze'], 13: ['treze'], 14: ['catorze', 'quatorze'],
  15: ['quinze'], 16: ['dezesseis'], 17: ['dezessete'], 18: ['dezoito'],
  19: ['dezenove'], 20: ['vinte'],
};

// Palavras muito comuns: variações automáticas iguais a elas são ignoradas,
// e o dicionário avisa quando o usuário cadastra uma delas.
export const PALAVRAS_COMUNS = new Set([
  'a', 'e', 'o', 'as', 'os', 'um', 'uma', 'de', 'da', 'do', 'das', 'dos', 'se',
  'te', 'me', 'na', 'no', 'em', 'ou', 'ao', 'que', 'pe', 've', 'ce', 'ze', 'be',
  'ge', 'i', 'u', 'ele', 'ela', 'esse', 'essa', 'eu', 'tu', 'ja', 'la', 'ca',
  'so', 'ha', 'mas', 'nem', 'por', 'com', 'sem', 'dois', 'duas', 'tres', 'sete',
]);

// Comandos falados de pontuação (sequências de palavras normalizadas).
// Os mais longos vêm primeiro para terem prioridade.
const COMANDOS = [
  [['ponto', 'de', 'interrogacao'], { tipo: 'pont', texto: '?' }],
  [['ponto', 'de', 'exclamacao'], { tipo: 'pont', texto: '!' }],
  [['ponto', 'e', 'virgula'], { tipo: 'pont', texto: ';' }],
  [['abre', 'parenteses'], { tipo: 'abrePar' }],
  [['fecha', 'parenteses'], { tipo: 'fechaPar' }],
  [['ponto', 'final'], { tipo: 'pont', texto: '.' }],
  [['dois', 'pontos'], { tipo: 'pont', texto: ':' }],
  [['abre', 'aspas'], { tipo: 'abreAspas' }],
  [['abrir', 'aspas'], { tipo: 'abreAspas' }],
  [['fecha', 'aspas'], { tipo: 'fechaAspas' }],
  [['fechar', 'aspas'], { tipo: 'fechaAspas' }],
  [['nova', 'linha'], { tipo: 'linha' }],
  [['novo', 'paragrafo'], { tipo: 'paragrafo' }],
  [['aspas'], { tipo: 'aspas' }], // abre ou fecha, conforme o caso
  [['reticencias'], { tipo: 'pont', texto: '…' }],
  [['travessao'], { tipo: 'travessao' }],
  [['virgula'], { tipo: 'pont', texto: ',' }],
  [['interrogacao'], { tipo: 'pont', texto: '?' }],
  [['exclamacao'], { tipo: 'pont', texto: '!' }],
  [['ponto'], { tipo: 'pont', texto: '.' }],
];

// Pontuação que o próprio reconhecedor às vezes já escreve.
const CARACTERES = {
  ',': { tipo: 'pont', texto: ',' }, '.': { tipo: 'pont', texto: '.' },
  '?': { tipo: 'pont', texto: '?' }, '!': { tipo: 'pont', texto: '!' },
  ':': { tipo: 'pont', texto: ':' }, ';': { tipo: 'pont', texto: ';' },
  '…': { tipo: 'pont', texto: '…' }, '...': { tipo: 'pont', texto: '…' },
  '"': { tipo: 'aspas' }, '“': { tipo: 'abreAspas' }, '”': { tipo: 'fechaAspas' },
  '—': { tipo: 'travessao' }, '–': { tipo: 'travessao' }, '-': { tipo: 'travessao' },
  '(': { tipo: 'abrePar' }, ')': { tipo: 'fechaPar' },
};

const MAX_TOKENS_CODIGO = 6;

// ---------- Normalização ----------

/** Minúsculas, sem acentos, só letras e números. "Dois-L" → "doisl". */
export function normalizar(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/** Divide o texto em palavras e sinais. */
export function tokenizar(texto) {
  const re = /[\p{L}\p{M}\p{N}]+(?:['’-][\p{L}\p{M}\p{N}]+)*|\.{3}|\S/gu;
  const lista = [];
  for (const m of String(texto || '').matchAll(re)) {
    const bruto = m[0];
    const ehPalavra = /[\p{L}\p{N}]/u.test(bruto);
    lista.push({ bruto, ehPalavra, n: ehPalavra ? normalizar(bruto) : '' });
  }
  return lista;
}

// ---------- Variações automáticas dos códigos ----------

/**
 * Gera variações faladas de um código. Ex.: "2L" → "2L", "dois L",
 * "dois ele", "doisel"... Devolve [{exibir, chave}].
 */
export function gerarVariacoesAuto(codigo) {
  const limpo = String(codigo || '').trim();
  const partes = limpo.match(/\d+|\p{L}/gu) || [];
  const resultado = new Map();
  const chaveCodigo = normalizar(limpo);
  if (chaveCodigo) resultado.set(chaveCodigo, limpo);
  if (partes.length === 0 || partes.length > 3) return [...resultado].map(([chave, exibir]) => ({ chave, exibir }));

  const alternativas = partes.map((p) => {
    if (/^\d+$/.test(p)) return [p, ...(NOMES_NUMEROS[Number(p)] || [])];
    const letra = normalizar(p);
    return [p.toUpperCase(), ...(NOMES_LETRAS[letra] || [])];
  });

  // Produto cartesiano das alternativas.
  let combos = [[]];
  for (const alts of alternativas) {
    const novos = [];
    for (const c of combos) for (const a of alts) novos.push([...c, a]);
    combos = novos;
  }
  for (const c of combos) {
    const chave = normalizar(c.join(''));
    if (!chave || resultado.has(chave)) continue;
    // Variação de uma parte só que é palavra comum ("ele", "dois") seria perigosa.
    if (partes.length === 1 && (PALAVRAS_COMUNS.has(chave) || /^\d+$/.test(chave))) continue;
    resultado.set(chave, c.join(' '));
  }
  return [...resultado].map(([chave, exibir]) => ({ chave, exibir }));
}

/**
 * Monta o índice de busca a partir das entradas do dicionário.
 * Variações cadastradas pelo usuário têm prioridade sobre as automáticas.
 */
export function construirIndice(entradas) {
  const mapa = new Map();
  const conflitos = [];
  const registrar = (chave, entrada, manual) => {
    if (!chave) return;
    const atual = mapa.get(chave);
    if (atual) {
      if (atual.entrada.id !== entrada.id) {
        if (manual && !atual.manual) { mapa.set(chave, { entrada, manual }); return; }
        conflitos.push({ chave, a: atual.entrada, b: entrada });
      }
      return;
    }
    mapa.set(chave, { entrada, manual });
  };
  for (const e of entradas || []) {
    registrar(normalizar(e.codigo), e, true);
    for (const v of e.variacoes || []) registrar(normalizar(v), e, true);
  }
  for (const e of entradas || []) {
    for (const v of gerarVariacoesAuto(e.codigo)) registrar(v.chave, e, false);
  }
  return { mapa, conflitos };
}

// ---------- Análise de um trecho reconhecido ----------

function casarCodigo(tokens, i, indice) {
  let chave = '';
  const candidatos = [];
  for (let k = 0; k < MAX_TOKENS_CODIGO && i + k < tokens.length; k++) {
    const t = tokens[i + k];
    if (!t.ehPalavra) break;
    chave += t.n;
    candidatos.push(chave);
  }
  // Mais longo primeiro.
  for (let k = candidatos.length; k >= 1; k--) {
    const achado = indice.mapa.get(candidatos[k - 1]);
    if (achado) return { entrada: achado.entrada, k };
  }
  return null;
}

function casarSequencia(tokens, i, palavras) {
  for (let j = 0; j < palavras.length; j++) {
    const t = tokens[i + j];
    if (!t || !t.ehPalavra || t.n !== palavras[j]) return 0;
  }
  return palavras.length;
}

function casarComando(tokens, i) {
  for (const [palavras, peca] of COMANDOS) {
    const k = casarSequencia(tokens, i, palavras);
    if (k) return { peca: { ...peca }, k };
  }
  return null;
}

/**
 * Transforma um trecho reconhecido numa lista de "peças"
 * (palavras, nomes do dicionário e sinais).
 * cfg: { gatilhoAtivo, palavraGatilho, comandosFalados }
 */
export function analisarTrecho(texto, indice, cfg = {}) {
  const tokens = tokenizar(texto);
  const gatilho = tokenizar(cfg.palavraGatilho || '').filter((t) => t.ehPalavra).map((t) => t.n);
  const usarGatilho = !!cfg.gatilhoAtivo && gatilho.length > 0;
  const comandos = cfg.comandosFalados !== false;
  const pecas = [];
  let i = 0;
  while (i < tokens.length) {
    if (indice && indice.mapa.size) {
      if (usarGatilho) {
        const g = casarSequencia(tokens, i, gatilho);
        if (g) {
          const m = casarCodigo(tokens, i + g, indice);
          if (m) {
            pecas.push({ tipo: 'nome', texto: m.entrada.texto, id: m.entrada.id });
            i += g + m.k;
            continue;
          }
        }
      } else {
        const m = casarCodigo(tokens, i, indice);
        if (m) {
          pecas.push({ tipo: 'nome', texto: m.entrada.texto, id: m.entrada.id });
          i += m.k;
          continue;
        }
      }
    }
    if (comandos) {
      const c = casarComando(tokens, i);
      if (c) { pecas.push(c.peca); i += c.k; continue; }
    }
    const t = tokens[i];
    if (t.ehPalavra) pecas.push({ tipo: 'palavra', texto: t.bruto, inicio: i === 0 });
    else pecas.push(CARACTERES[t.bruto] ? { ...CARACTERES[t.bruto] } : { tipo: 'palavra', texto: t.bruto });
    i++;
  }
  return pecas;
}

// ---------- Montagem com espaçamento e maiúsculas ----------

const ABERTURAS = new Set(['“', '(', '‘', '«', '[']);

const FRACOS = ',;:';
const FORTES = '.?!…';
const SINAIS = FRACOS + FORTES;

/**
 * Junta dois sinais vizinhos sem pontuação dupla.
 * ",." → "."   ".." → "."   ".?" → "?"   "?," → "?"   "?!" fica.
 */
export function juntarPontuacao(a, b) {
  if (a === b && ',.;:…'.includes(a)) return a;
  if (FRACOS.includes(a) && SINAIS.includes(b)) return b;
  if (FORTES.includes(a) && FRACOS.includes(b)) return a;
  if (a === '.' && FORTES.includes(b)) return b;
  if (FORTES.includes(a) && b === '.') return a;
  return a + b;
}

function aparaEspacos(s) {
  return s.replace(/[ \t ]+$/, '');
}

function ultimaLinha(s) {
  return s.slice(s.lastIndexOf('\n') + 1);
}

/** Há aspas abertas (sem fechar) na linha atual? */
export function aspasAbertas(s) {
  const linha = ultimaLinha(s);
  const abre = (linha.match(/“/g) || []).length;
  const fecha = (linha.match(/”/g) || []).length;
  const retas = (linha.match(/"/g) || []).length;
  return abre > fecha || retas % 2 === 1;
}

/** Precisa de espaço antes da próxima palavra? */
export function precisaEspaco(s) {
  if (!s) return false;
  const c = s[s.length - 1];
  if (/\s/.test(c)) return false;
  if (ABERTURAS.has(c)) return false;
  if (c === '"') return !aspasAbertas(s); // aspas retas abertas: sem espaço
  return true;
}

/** A próxima palavra começa frase? */
export function precisaMaiuscula(s) {
  let i = s.length - 1;
  while (i >= 0 && (s[i] === ' ' || s[i] === '\t' || s[i] === ' ' || ABERTURAS.has(s[i]) || s[i] === '"')) i--;
  if (i < 0) return true;
  const c = s[i];
  if (c === '\n') return true;
  if (c === '.' || c === '?' || c === '!') return true;
  if (c === '—' || c === '–') {
    // Travessão de diálogo no começo da linha.
    let j = i - 1;
    while (j >= 0 && (s[j] === ' ' || s[j] === '\t')) j--;
    return j < 0 || s[j] === '\n';
  }
  return false;
}

function maiusculaInicial(t) {
  return t.charAt(0).toLocaleUpperCase('pt-BR') + t.slice(1);
}

function minusculaInicial(t) {
  return t.charAt(0).toLocaleLowerCase('pt-BR') + t.slice(1);
}

// "Estava" → true; "ONU", "eBay", "Li" com 1 letra → false.
function soPrimeiraMaiuscula(t) {
  if (t.length < 2) return false;
  const p = t.charAt(0);
  const resto = t.slice(1);
  return p !== p.toLocaleLowerCase('pt-BR') && resto === resto.toLocaleLowerCase('pt-BR');
}

/** Acrescenta uma peça ao final de "s", cuidando do espaçamento. */
export function anexar(s, peca, cfg = {}) {
  const maiuscula = cfg.maiusculaAuto !== false;
  switch (peca.tipo) {
    case 'palavra': {
      let t = peca.texto;
      if (maiuscula) {
        if (precisaMaiuscula(s)) t = maiusculaInicial(t);
        // O reconhecedor costuma pôr maiúscula no começo de cada trecho.
        else if (peca.inicio && soPrimeiraMaiuscula(t)) t = minusculaInicial(t);
      }
      return s + (precisaEspaco(s) ? ' ' : '') + t;
    }
    case 'nome':
      // Nomes do dicionário entram exatamente como cadastrados.
      return s + (precisaEspaco(s) ? ' ' : '') + peca.texto;
    case 'pont': {
      const o = aparaEspacos(s);
      const c = peca.texto;
      const ultimo = o.slice(-1);
      if (ultimo && SINAIS.includes(ultimo)) return o.slice(0, -1) + juntarPontuacao(ultimo, c);
      return o + c;
    }
    case 'travessao': {
      const o = aparaEspacos(s);
      if (o === '' || o.endsWith('\n')) return o + '— ';
      return o + ' — ';
    }
    case 'abreAspas':
      return s + (precisaEspaco(s) ? ' ' : '') + '“';
    case 'fechaAspas':
      return aparaEspacos(s) + '”';
    case 'aspas':
      return anexar(s, { tipo: aspasAbertas(s) ? 'fechaAspas' : 'abreAspas' }, cfg);
    case 'abrePar':
      return s + (precisaEspaco(s) ? ' ' : '') + '(';
    case 'fechaPar':
      return aparaEspacos(s) + ')';
    case 'linha':
      return aparaEspacos(s) + '\n';
    case 'paragrafo': {
      const o = aparaEspacos(s);
      if (o === '' || o.endsWith('\n\n')) return o;
      if (o.endsWith('\n')) return o + '\n';
      return o + '\n\n';
    }
    default:
      return s;
  }
}

/**
 * Insere peças entre "antes" e "depois" (posição do cursor).
 * Devolve { texto, cursor } — cursor logo após o que foi inserido.
 */
export function montarInsercao(antes, pecas, depois, cfg = {}, nomes = []) {
  let s = antes;
  for (const p of pecas) s = anexar(s, p, cfg);
  let d = depois || '';
  if (d) {
    const c = d[0];
    if (c === ' ' || c === '\t') {
      if (s === '' || /\s$/.test(s)) d = d.replace(/^[ \t]+/, '');
    } else if (c === '\n') {
      s = aparaEspacos(s);
    } else if (/[,.;:!?…”)\]]/.test(c)) {
      s = aparaEspacos(s);
      // Sem pontuação dupla na emenda (",." vira "."), preservando reticências.
      const u = s.slice(-1);
      if (u && SINAIS.includes(u) && SINAIS.includes(c) && !s.endsWith('..') && !d.startsWith('..')) {
        const j = juntarPontuacao(u, c);
        if (j === u) d = d.slice(1);
        else if (j === c) s = s.slice(0, -1);
      }
    } else if (precisaEspaco(s)) {
      s += ' ';
    }
    // Começo de frase no texto que vem depois (nomes do dicionário ficam como cadastrados).
    if (cfg.maiusculaAuto !== false && pecas.length && precisaMaiuscula(s)) {
      const m = d.match(/^([ \t]*)(\p{Ll})/u);
      const ehNome = m && nomes.some((n) => n && d.startsWith(n, m[1].length));
      if (m && !ehNome && pecas[pecas.length - 1].tipo !== 'palavra' && pecas[pecas.length - 1].tipo !== 'nome') {
        d = m[1] + m[2].toLocaleUpperCase('pt-BR') + d.slice(m[0].length);
      }
    }
  }
  return { texto: s + d, cursor: s.length };
}

/** Texto provisório (resultado parcial) mostrado enquanto a pessoa fala. */
export function previaParcial(antes, parcial) {
  if (!parcial) return '';
  return (precisaEspaco(antes) ? ' ' : '') + parcial.trim();
}

// ---------- Pontuação automática (pausas, perguntas, conjunções) ----------

export const PAUSA_CURTA_PADRAO = 700;   // ms — vírgula
export const PAUSA_LONGA_PADRAO = 1600;  // ms — ponto final

// Começos de pergunta (normalizados). Os mais longos vêm primeiro.
const INICIOS_PERGUNTA = [
  ['sera', 'que'], ['por', 'que'], ['o', 'que'], ['porque'], ['quem'],
  ['como'], ['onde'], ['aonde'], ['quando'], ['qual'], ['quais'], ['quanto'],
  ['quanta'], ['quantos'], ['quantas'], ['cade'],
];

// Recebem vírgula antes quando não há pontuação.
const CONJUNCOES = new Set(['mas', 'porem', 'contudo', 'entao', 'entretanto', 'todavia']);
// Depois destas palavras a conjunção não leva vírgula ("e então", "desde então").
const SEM_VIRGULA_DEPOIS = new Set(['e', 'ou', 'nem', 'que', 'se', 'mas', 'pois', 'porque', 'ate', 'so', 'desde', 'ja', 'entao']);

/** A frase que está sendo escrita no fim de "s" começa como pergunta? */
export function frasePergunta(s) {
  const t = String(s || '');
  let i = t.length - 1;
  while (i >= 0 && !'.?!…\n'.includes(t[i])) i--;
  const palavras = tokenizar(t.slice(i + 1)).filter((x) => x.ehPalavra).map((x) => x.n);
  return INICIOS_PERGUNTA.some((seq) => seq.every((p, j) => palavras[j] === p));
}

function ultimaPalavra(s) {
  const m = String(s || '').match(/([\p{L}\p{M}\p{N}]+)[ \t]*$/u);
  return m ? normalizar(m[1]) : null;
}

/**
 * Acrescenta pontuação automática às peças de um trecho ditado.
 *  antes: texto antes do ponto de inserção
 *  opc.pausa: silêncio (ms) desde o trecho anterior, ou null se não for continuação
 *  opc.curta / opc.longa: limites de pausa (ms)
 * Comandos falados têm prioridade: se o trecho começa com pontuação, nada é acrescentado.
 */
export function pontuarAuto(antes, pecas, opc = {}) {
  if (!pecas || !pecas.length) return pecas;
  const curta = Number(opc.curta) || PAUSA_CURTA_PADRAO;
  const longa = Math.max(Number(opc.longa) || PAUSA_LONGA_PADRAO, curta);
  const fim = aparaEspacos(String(antes || ''));
  const terminaEmPalavra = /[\p{L}\p{M}\p{N}”’)]$/u.test(fim);
  const saida = [];

  // 1. Pausa entre trechos.
  if (opc.pausa != null && opc.pausa >= curta && terminaEmPalavra) {
    const p0 = pecas[0];
    const longaPausa = opc.pausa >= longa;
    let pode = false;
    if (p0.tipo === 'palavra' || p0.tipo === 'nome' || p0.tipo === 'abreAspas' || p0.tipo === 'abrePar') pode = true;
    else if (p0.tipo === 'aspas') pode = !aspasAbertas(fim);
    else if (p0.tipo === 'linha' || p0.tipo === 'paragrafo') pode = longaPausa;
    if (pode) {
      const sinal = longaPausa ? (frasePergunta(fim) ? '?' : '.') : ',';
      saida.push({ tipo: 'pont', texto: sinal, auto: true });
    }
  }

  // 2. Vírgula antes de conjunções.
  let anterior = saida.length ? 'pont' : (terminaEmPalavra && /[\p{L}\p{M}\p{N}]$/u.test(fim) ? 'palavra' : 'outro');
  let palavraAnterior = anterior === 'palavra' ? ultimaPalavra(fim) : null;
  for (const p of pecas) {
    if (p.tipo === 'palavra') {
      const n = normalizar(p.texto);
      if (CONJUNCOES.has(n) && (anterior === 'palavra' || anterior === 'nome') && !SEM_VIRGULA_DEPOIS.has(palavraAnterior)) {
        saida.push({ tipo: 'pont', texto: ',', auto: true });
      }
      palavraAnterior = n;
    } else {
      palavraAnterior = null;
    }
    anterior = p.tipo === 'palavra' || p.tipo === 'nome' ? p.tipo : 'outro';
    saida.push(p);
  }
  return saida;
}

// ---------- Modo teclado (texto digitado ou ditado pelo teclado do celular) ----------

function tokenizarComPosicao(texto, base = 0) {
  const re = /[\p{L}\p{M}\p{N}]+(?:['’-][\p{L}\p{M}\p{N}]+)*|\.{3}|\S/gu;
  const lista = [];
  for (const m of String(texto || '').matchAll(re)) {
    const bruto = m[0];
    const ehPalavra = /[\p{L}\p{N}]/u.test(bruto);
    lista.push({ bruto, ehPalavra, n: ehPalavra ? normalizar(bruto) : '', ini: base + m.index, fim: base + m.index + bruto.length });
  }
  return lista;
}

function reduzirSinais(seq) {
  if (/^\.{3,}$/.test(seq)) return seq; // reticências
  let r = seq[0];
  for (const c of seq.slice(1)) r = r.slice(0, -1) + juntarPontuacao(r.slice(-1), c);
  return r;
}

/**
 * Ajusta um trecho que entrou pelo teclado, entre as posições "a" e "b":
 * troca códigos do dicionário (sem trocar palavras comuns por engano),
 * tira espaço duplo, espaço antes de pontuação e pontuação dupla, e põe
 * maiúscula depois de ponto, "?", "!" e nova linha. Nunca acrescenta
 * pontuação (o teclado já pontua). Nomes do dicionário não são alterados.
 * Devolve { texto, delta, ids } ou null se nada mudou.
 */
export function ajustarTeclado(texto, a, b, indice, cfg = {}, nomes = []) {
  const original = String(texto || '');
  b = Math.min(b, original.length);
  a = Math.max(0, Math.min(a, b));
  // Começa no início da palavra.
  while (a > 0 && /[\p{L}\p{M}\p{N}]/u.test(original[a - 1])) a--;
  if (b <= a) return null;
  let t = original;
  let fimReg = b;
  const ids = [];
  const listaNomes = (nomes || []).filter(Boolean);

  // 1. Códigos do dicionário.
  if (indice && indice.mapa && indice.mapa.size) {
    let ext = Math.max(0, a - 80);
    while (ext > 0 && !/\s/.test(t[ext - 1])) ext--;
    const tokens = tokenizarComPosicao(t.slice(ext, fimReg), ext);
    const protegidos = [];
    for (const n of listaNomes) {
      let p = t.indexOf(n, ext);
      while (p !== -1 && p < fimReg) { protegidos.push([p, p + n.length]); p = t.indexOf(n, p + 1); }
    }
    const protegido = (tk) => protegidos.some(([x, y]) => tk.ini < y && tk.fim > x);
    const gatilho = tokenizar(cfg.palavraGatilho || '').filter((x) => x.ehPalavra).map((x) => x.n);
    const usarGatilho = !!cfg.gatilhoAtivo && gatilho.length > 0;
    const trocas = [];
    let i = 0;
    while (i < tokens.length) {
      let g = 0;
      if (usarGatilho) {
        g = casarSequencia(tokens, i, gatilho);
        if (!g) { i++; continue; }
      }
      let achou = null;
      let chave = '';
      const cands = [];
      for (let k = 0; k < MAX_TOKENS_CODIGO && i + g + k < tokens.length; k++) {
        const tk = tokens[i + g + k];
        if (!tk.ehPalavra || protegido(tk)) break;
        chave += tk.n;
        cands.push(chave);
      }
      for (let k = cands.length; k >= 1; k--) {
        const c = cands[k - 1];
        // Sem palavra-gatilho, uma palavra comum ("a", "ele") nunca é trocada ao digitar.
        if (!usarGatilho && PALAVRAS_COMUNS.has(c)) continue;
        const r = indice.mapa.get(c);
        if (r) { achou = { entrada: r.entrada, k }; break; }
      }
      if (achou) {
        const ini = tokens[i].ini;
        const fim = tokens[i + g + achou.k - 1].fim;
        if (fim > a && t.slice(ini, fim) !== achou.entrada.texto) {
          trocas.push({ ini, fim, texto: achou.entrada.texto });
          ids.push(achou.entrada.id);
        }
        i += g + achou.k;
      } else {
        i++;
      }
    }
    for (const tr of trocas.reverse()) {
      t = t.slice(0, tr.ini) + tr.texto + t.slice(tr.fim);
      fimReg += tr.texto.length - (tr.fim - tr.ini);
    }
  }

  // 2. Espaços e pontuação.
  let ini = a;
  while (ini > 0 && /[ \t,.;:?!…]/.test(t[ini - 1])) ini--;
  const esquerda = t.slice(0, ini);
  let seg = t.slice(ini, fimReg);
  seg = seg.replace(/[ \t]{2,}/g, ' ');
  if (/[\p{L}\p{M}\p{N}”)]$/u.test(esquerda) || esquerda === '') seg = seg.replace(/^[ \t]+(?=[,.;:!?…)\]”])/, '');
  seg = seg.replace(/[ \t]+(?=[,.;:!?…)\]”])/g, '');
  seg = seg.replace(/[,.;:?!…]{2,}/g, reduzirSinais);

  // 3. Maiúsculas no começo de frase.
  if (cfg.maiusculaAuto !== false) {
    let r = '';
    for (let k = 0; k < seg.length; k++) {
      const c = seg[k];
      const prev = k > 0 ? seg[k - 1] : esquerda.slice(-1);
      if (/\p{Ll}/u.test(c) && !/[\p{L}\p{M}\p{N}'’-]/u.test(prev || '')) {
        const prefixo = esquerda + r;
        const palavra = seg.slice(k).match(/^[\p{L}\p{M}]+/u)[0];
        const misto = /\p{Lu}/u.test(palavra.slice(1)); // "iPhone"
        const reticencias = /(\.\.|…)[ \t"“(]*$/.test(prefixo);
        const pos = prefixo.length;
        const ehNome = listaNomes.some((n) => (esquerda + r + seg.slice(k)).startsWith(n, pos));
        if (!misto && !reticencias && !ehNome && precisaMaiuscula(prefixo)) {
          r += c.toLocaleUpperCase('pt-BR');
          continue;
        }
      }
      r += c;
    }
    seg = r;
  }

  const novo = esquerda + seg + t.slice(fimReg);
  if (novo === original) return null;
  return { texto: novo, delta: novo.length - original.length, ids };
}

// ---------- Utilidades ----------

/** O que o botão "Copiar" deve copiar: o trecho selecionado ou o texto inteiro. */
export function textoParaCopiar(texto, inicio, fim) {
  const t = String(texto || '');
  if (Number.isInteger(inicio) && Number.isInteger(fim) && fim > inicio) {
    return { texto: t.slice(inicio, fim), trecho: true };
  }
  return { texto: t, trecho: false };
}

export function contarPalavras(texto) {
  const m = String(texto || '').match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
  return m ? m.length : 0;
}

/** Variações (cadastradas ou o código) que são palavras comuns. */
export function variacoesArriscadas(entrada) {
  const lista = [entrada.codigo, ...(entrada.variacoes || [])];
  return lista.filter((v) => PALAVRAS_COMUNS.has(normalizar(v)));
}
