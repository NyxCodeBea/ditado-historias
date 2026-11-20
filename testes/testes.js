// ============================================================
// Testes automáticos da lógica de texto.
// No computador:  node testes/testes.js
// No navegador:   abra testes/testes.html
// ============================================================

import {
  analisarTrecho, construirIndice, montarInsercao, contarPalavras,
  gerarVariacoesAuto, normalizar, previaParcial, textoParaCopiar,
} from '../js/texto.js';
import { criarZip, gerarDocx } from '../js/exportar.js';
import { aplicarSugestoes } from '../js/revisao.js';

const DICIONARIO = [
  { id: '1', codigo: 'H', variacoes: ['agá', 'a'], texto: 'Hán Lì 韩立', categoria: 'personagem' },
  { id: '2', codigo: '2L', variacoes: ['dois L', 'doisel'], texto: 'Lín Yǔ', categoria: 'personagem' },
  { id: '3', codigo: 'HL', variacoes: [], texto: 'Huáng Lóng', categoria: 'personagem' },
  { id: '4', codigo: '2P', variacoes: [], texto: 'Palácio Celeste', categoria: 'lugar' },
  { id: '5', codigo: '2M', variacoes: [], texto: 'qì', categoria: 'termo' },
];

const SEM_GATILHO = { gatilhoAtivo: false, palavraGatilho: 'código', comandosFalados: true, maiusculaAuto: true };
const COM_GATILHO = { ...SEM_GATILHO, gatilhoAtivo: true };

// Simula um ditado: insere o trecho na posição "pos" do texto.
function ditar(texto, pos, falado, cfg = SEM_GATILHO, dic = DICIONARIO) {
  const indice = construirIndice(dic);
  const pecas = analisarTrecho(falado, indice, cfg);
  return montarInsercao(texto.slice(0, pos), pecas, texto.slice(pos), cfg);
}

const casos = [];
function teste(nome, fn) { casos.push({ nome, fn }); }
function igual(obtido, esperado) {
  if (obtido !== esperado) {
    throw new Error(`esperado ${JSON.stringify(esperado)}, obtido ${JSON.stringify(obtido)}`);
  }
}

// ---------- Maiúsculas e pontuação ----------
teste('maiúscula no início do texto', () => {
  igual(ditar('', 0, 'era uma vez').texto, 'Era uma vez');
});
teste('comando "vírgula" e "ponto"', () => {
  igual(ditar('', 0, 'era uma vez vírgula um rapaz ponto ele correu').texto,
    'Era uma vez, um rapaz. Ele correu');
});
teste('ponto de interrogação e exclamação', () => {
  igual(ditar('', 0, 'quem é você ponto de interrogação socorro ponto de exclamação').texto,
    'Quem é você? Socorro!');
});
teste('dois pontos e travessão de diálogo', () => {
  igual(ditar('Ele disse', 9, 'dois pontos nova linha travessão vou embora').texto,
    'Ele disse:\n— Vou embora');
});
teste('aspas abre e fecha', () => {
  igual(ditar('', 0, 'ela gritou abre aspas corra fecha aspas e saiu').texto,
    'Ela gritou “corra” e saiu');
});
teste('aspas alternadas (botão)', () => {
  igual(ditar('', 0, 'disse aspas olá aspas baixinho').texto, 'Disse “olá” baixinho');
});
teste('novo parágrafo', () => {
  igual(ditar('Fim.', 4, 'novo parágrafo começo').texto, 'Fim.\n\nComeço');
});
teste('sem espaço antes de pontuação vinda do reconhecedor', () => {
  igual(ditar('', 0, 'olá , tudo bem ?').texto, 'Olá, tudo bem?');
});
teste('não duplica ponto', () => {
  igual(ditar('Acabou.', 7, 'ponto').texto, 'Acabou.');
});
teste('reticências', () => {
  igual(ditar('', 0, 'talvez reticências').texto, 'Talvez…');
});

// ---------- Inserção no cursor ----------
teste('insere no meio com espaçamento', () => {
  const r = ditar('Ele viu o mar.', 7, 'de longe');
  igual(r.texto, 'Ele viu de longe o mar.');
  igual(r.cursor, 16);
});
teste('insere antes de pontuação sem espaço extra', () => {
  igual(ditar('Ele viu o mar.', 13, 'azul').texto, 'Ele viu o mar azul.');
});
teste('ponto no meio capitaliza o que vem depois', () => {
  igual(ditar('Ele correu ela ficou.', 10, 'ponto').texto, 'Ele correu. Ela ficou.');
});
teste('tira maiúscula que o reconhecedor põe no começo do trecho', () => {
  igual(ditar('Ele disse que', 13, 'Estava cansado').texto, 'Ele disse que estava cansado');
});
teste('sem espaço duplo', () => {
  igual(ditar('Ele ', 4, 'foi').texto, 'Ele foi');
  igual(ditar('Ele  foi', 4, 'logo').texto, 'Ele logo foi');
});

// ---------- Códigos ----------
teste('código simples sem gatilho', () => {
  igual(ditar('', 0, 'H entrou na sala').texto, 'Hán Lì 韩立 entrou na sala');
});
teste('variação "agá"', () => {
  igual(ditar('', 0, 'agá sorriu').texto, 'Hán Lì 韩立 sorriu');
});
teste('variação "dois L" (duas palavras)', () => {
  igual(ditar('', 0, 'dois L chegou').texto, 'Lín Yǔ chegou');
});
teste('variação "2 l" e "doisel"', () => {
  igual(ditar('', 0, 'viu 2 l').texto, 'Viu Lín Yǔ');
  igual(ditar('', 0, 'viu doisel').texto, 'Viu Lín Yǔ');
});
teste('variação automática "dois pê" para 2P', () => {
  igual(ditar('', 0, 'foi ao dois pê').texto, 'Foi ao Palácio Celeste');
});
teste('código maior tem prioridade (HL antes de H)', () => {
  igual(ditar('', 0, 'HL apareceu').texto, 'Huáng Lóng apareceu');
  igual(ditar('', 0, 'agá ele apareceu').texto, 'Huáng Lóng apareceu');
});
teste('nome em minúscula fica como cadastrado no começo da frase', () => {
  igual(ditar('', 0, '2M fluía').texto, 'qì fluía');
});
teste('sem gatilho, a variação "a" troca o artigo', () => {
  igual(ditar('', 0, 'viu a casa').texto, 'Viu Hán Lì 韩立 casa');
});
teste('com gatilho, "a" comum não é trocado', () => {
  igual(ditar('', 0, 'viu a casa de código a', COM_GATILHO).texto, 'Viu a casa de Hán Lì 韩立');
});
teste('com gatilho e código de duas palavras', () => {
  igual(ditar('', 0, 'código dois L sorriu', COM_GATILHO).texto, 'Lín Yǔ sorriu');
});
teste('gatilho sem código conhecido fica como texto', () => {
  igual(ditar('', 0, 'o código secreto', COM_GATILHO).texto, 'O código secreto');
});
teste('"dois pontos" não vira código', () => {
  igual(ditar('', 0, 'disse dois pontos').texto, 'Disse:');
});
teste('nome seguido de pontuação', () => {
  igual(ditar('', 0, 'olá H ponto de exclamação').texto, 'Olá Hán Lì 韩立!');
});

// ---------- Outros ----------
teste('normalizar', () => {
  igual(normalizar('Dois-L'), 'doisl');
  igual(normalizar('Agá'), 'aga');
});
teste('variações automáticas de 2L incluem "dois ele"', () => {
  const v = gerarVariacoesAuto('2L').map((x) => x.chave);
  if (!v.includes('doisele') || !v.includes('2l') || !v.includes('doisel')) throw new Error(v.join(','));
});
teste('variação automática perigosa ("ele" para L) é ignorada', () => {
  const v = gerarVariacoesAuto('L').map((x) => x.chave);
  if (v.includes('ele')) throw new Error(v.join(','));
});
teste('contador de palavras', () => {
  igual(contarPalavras('— Olá, Hán Lì! Tudo bem-vindo?\n\n2L'), 6);
  igual(contarPalavras(''), 0);
});
teste('prévia parcial com espaço', () => {
  igual(previaParcial('Ele', 'foi'), ' foi');
  igual(previaParcial('', 'foi'), 'foi');
});
teste('zip/docx gerado tem assinatura correta', () => {
  const zip = criarZip([{ nome: 'a.txt', dados: new TextEncoder().encode('olá') }]);
  igual(zip[0], 0x50); igual(zip[1], 0x4b);
  const docx = gerarDocx('Título', 'Linha 1\nLinha “2” & <3>');
  if (docx.length < 500) throw new Error('docx muito pequeno');
});
teste('aplicar sugestões da revisão (fase 2)', () => {
  const texto = 'Eles foi embora .';
  const r = aplicarSugestoes(texto, [
    { inicio: 5, fim: 8, sugestao: 'foram' },
    { inicio: 15, fim: 17, sugestao: '.' },
  ]);
  igual(r, 'Eles foram embora.');
});

teste('copiar: trecho selecionado ou texto inteiro', () => {
  igual(textoParaCopiar('Era uma vez.', 4, 7).texto, 'uma');
  igual(textoParaCopiar('Era uma vez.', 4, 7).trecho, true);
  igual(textoParaCopiar('Era uma vez.', 5, 5).texto, 'Era uma vez.');
  igual(textoParaCopiar('Era uma vez.').trecho, false);
});

export function executarTestes() {
  const resultados = [];
  for (const c of casos) {
    try { c.fn(); resultados.push({ nome: c.nome, ok: true }); }
    catch (e) { resultados.push({ nome: c.nome, ok: false, erro: e.message }); }
  }
  return resultados;
}

// Execução direta pelo Node.
if (typeof process !== 'undefined' && process.argv && process.argv[1] && process.argv[1].endsWith('testes.js')) {
  const r = executarTestes();
  for (const x of r) console.log(`${x.ok ? 'OK  ' : 'FALHOU'} ${x.nome}${x.ok ? '' : ' — ' + x.erro}`);
  const falhas = r.filter((x) => !x.ok).length;
  console.log(`\n${r.length - falhas}/${r.length} testes passaram.`);
  process.exit(falhas ? 1 : 0);
}
