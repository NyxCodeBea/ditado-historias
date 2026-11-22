// ============================================================
// Testes automáticos da lógica de texto.
// No computador:  node testes/testes.js
// No navegador:   abra testes/testes.html
// ============================================================

import {
  analisarTrecho, construirIndice, montarInsercao, contarPalavras,
  gerarVariacoesAuto, normalizar, previaParcial, textoParaCopiar,
  pontuarAuto, frasePergunta, juntarPontuacao, ajustarTeclado,
} from '../js/texto.js';
import { criarZip, gerarDocx } from '../js/exportar.js';

const DICIONARIO = [
  { id: '1', codigo: 'H', variacoes: ['agá', 'a'], texto: 'Hán Lì 韩立', categoria: 'personagem' },
  { id: '2', codigo: '2L', variacoes: ['dois L', 'doisel'], texto: 'Lín Yǔ', categoria: 'personagem' },
  { id: '3', codigo: 'HL', variacoes: [], texto: 'Huáng Lóng', categoria: 'personagem' },
  { id: '4', codigo: '2P', variacoes: [], texto: 'Palácio Celeste', categoria: 'lugar' },
  { id: '5', codigo: '2M', variacoes: [], texto: 'qì', categoria: 'termo' },
];

const SEM_GATILHO = { gatilhoAtivo: false, palavraGatilho: 'código', comandosFalados: true, maiusculaAuto: true, pontuacaoAuto: true };
const COM_GATILHO = { ...SEM_GATILHO, gatilhoAtivo: true };

// Simula um ditado: insere o trecho na posição "pos" do texto
// (com a pontuação automática, como no app, mas sem pausa medida).
function ditar(texto, pos, falado, cfg = SEM_GATILHO, dic = DICIONARIO) {
  const indice = construirIndice(dic);
  let pecas = analisarTrecho(falado, indice, cfg);
  if (cfg.pontuacaoAuto) pecas = pontuarAuto(texto.slice(0, pos), pecas, { pausa: null });
  return montarInsercao(texto.slice(0, pos), pecas, texto.slice(pos), cfg, dic.map((e) => e.texto));
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
// ---------- Pontuação automática pelas pausas ----------
const PAUSAS = { curta: 700, longa: 1600 };
const NOMES = DICIONARIO.map((e) => e.texto);

// Simula um trecho ditado no fim do texto depois de uma pausa (ms).
function ditarPausa(texto, falado, pausa, cfg = SEM_GATILHO, dic = DICIONARIO) {
  const indice = construirIndice(dic);
  const pecas = pontuarAuto(texto, analisarTrecho(falado, indice, cfg), { ...PAUSAS, pausa });
  return montarInsercao(texto, pecas, '', cfg, dic.map((e) => e.texto)).texto;
}
// Simula vários trechos seguidos com as pausas entre eles.
function ditarSequencia(trechos, cfg = SEM_GATILHO) {
  let t = '';
  let pausa = null;
  for (const x of trechos) {
    if (typeof x === 'number') { pausa = x; continue; }
    t = ditarPausa(t, x, pausa, cfg);
    pausa = 0;
  }
  return t;
}

teste('pausa curta vira vírgula', () => {
  igual(ditarPausa('Ele chegou', 'olhou em volta', 900), 'Ele chegou, olhou em volta');
});
teste('pausa longa vira ponto e maiúscula', () => {
  igual(ditarPausa('Ele chegou', 'depois foi embora', 2000), 'Ele chegou. Depois foi embora');
});
teste('pausa pequena demais não pontua', () => {
  igual(ditarPausa('Ele chegou', 'e sentou', 300), 'Ele chegou e sentou');
});
teste('sem pausa medida (primeiro trecho, cursor movido, texto editado) não pontua', () => {
  igual(ditarPausa('Ele chegou', 'e sentou', null), 'Ele chegou e sentou');
});
teste('sequência de trechos com pausas', () => {
  igual(ditarSequencia(['era uma vez um rapaz', 900, 'muito pobre', 2100, 'ele vivia sozinho']),
    'Era uma vez um rapaz, muito pobre. Ele vivia sozinho');
});
teste('tempos de pausa ajustáveis', () => {
  const indice = construirIndice([]);
  const p = (pausa, o) => montarInsercao('Ele chegou',
    pontuarAuto('Ele chegou', analisarTrecho('e sentou', indice, SEM_GATILHO), { pausa, ...o }), '', SEM_GATILHO).texto;
  igual(p(900, { curta: 1000, longa: 2500 }), 'Ele chegou e sentou');
  igual(p(1200, { curta: 1000, longa: 2500 }), 'Ele chegou, e sentou');
  igual(p(1200, { curta: 400, longa: 1000 }), 'Ele chegou. E sentou');
});
teste('não pontua de novo se já há pontuação', () => {
  igual(ditarPausa('Ele chegou.', 'depois saiu', 2000), 'Ele chegou. Depois saiu');
  igual(ditarPausa('Ele chegou,', 'depois saiu', 2000), 'Ele chegou, depois saiu');
  igual(ditarPausa('Ele disse:', 'vamos', 2000), 'Ele disse: vamos');
});
teste('comando falado tem prioridade sobre a pausa', () => {
  igual(ditarPausa('Quem é você', 'ponto de exclamação', 2000), 'Quem é você!');
  igual(ditarPausa('Ele chegou', 'vírgula depois saiu', 2000), 'Ele chegou, depois saiu');
  igual(ditarPausa('Ele chegou', 'ponto e vírgula saiu', 900), 'Ele chegou; saiu');
});
teste('pausa longa antes de nova linha fecha a frase', () => {
  igual(ditarPausa('Ele saiu', 'nova linha travessão volto logo', 2000), 'Ele saiu.\n— Volto logo');
  igual(ditarPausa('Ele saiu', 'nova linha', 900), 'Ele saiu\n');
});
teste('pausa antes de nome do dicionário', () => {
  igual(ditarPausa('Ele chegou', 'H sorriu', 2000), 'Ele chegou. Hán Lì 韩立 sorriu');
});

// ---------- Interrogação ----------
teste('frase com palavra interrogativa termina com "?"', () => {
  igual(ditarPausa('Quem é você', 'eu sou o guarda', 2000), 'Quem é você? Eu sou o guarda');
  igual(ditarPausa('Onde ele está', 'ninguém sabe', 2000), 'Onde ele está? Ninguém sabe');
  igual(ditarPausa('Será que ele volta', 'talvez', 2000), 'Será que ele volta? Talvez');
  igual(ditarPausa('Por que você foi', 'porque quis', 2000), 'Por que você foi? Porque quis');
});
teste('palavras interrogativas reconhecidas', () => {
  for (const f of ['quem veio', 'como foi', 'por que não', 'porque não veio', 'será que vem', 'onde fica',
    'quando volta', 'qual deles', 'quanto custa', 'o que houve', 'Quantas são', 'cadê ele']) {
    if (!frasePergunta(f)) throw new Error(f);
  }
  for (const f of ['ele veio', 'o rei chegou', 'que bom', 'será assim', 'porta aberta']) {
    if (frasePergunta(f)) throw new Error(f);
  }
});
teste('interrogação olha só a frase atual (e diálogo)', () => {
  igual(ditarPausa('Ele chegou. Quem é', 'ninguém respondeu', 2000), 'Ele chegou. Quem é? Ninguém respondeu');
  igual(ditarPausa('Quem veio? Ele chegou', 'depois', 2000), 'Quem veio? Ele chegou. Depois');
  igual(ditarPausa('Fim.\n— Onde você estava', 'aqui', 2000), 'Fim.\n— Onde você estava? Aqui');
});
teste('pausa curta em pergunta continua sendo vírgula', () => {
  igual(ditarPausa('Quem é você', 'afinal', 900), 'Quem é você, afinal');
});

// ---------- Conjunções ----------
teste('vírgula antes de "mas", "porém", "contudo", "então", "entretanto"', () => {
  igual(ditar('', 0, 'ele queria ir mas não podia').texto, 'Ele queria ir, mas não podia');
  igual(ditar('', 0, 'era tarde porém ele ficou').texto, 'Era tarde, porém ele ficou');
  igual(ditar('', 0, 'estava cansado contudo seguiu').texto, 'Estava cansado, contudo seguiu');
  igual(ditar('', 0, 'ouviu um grito então correu').texto, 'Ouviu um grito, então correu');
  igual(ditar('', 0, 'era forte entretanto hesitou').texto, 'Era forte, entretanto hesitou');
});
teste('conjunção: sem vírgula dupla, nem depois de "e", "desde", nem no começo', () => {
  igual(ditar('', 0, 'ele queria ir vírgula mas não podia').texto, 'Ele queria ir, mas não podia');
  igual(ditar('', 0, 'e então ele saiu').texto, 'E então ele saiu');
  igual(ditar('', 0, 'desde então ninguém viu').texto, 'Desde então ninguém viu');
  igual(ditar('', 0, 'mas ele voltou').texto, 'Mas ele voltou');
  igual(ditar('Ele correu.', 11, 'então parou').texto, 'Ele correu. Então parou');
});
teste('conjunção no começo do trecho, emendando no texto anterior', () => {
  igual(ditarPausa('Ele queria ir', 'mas não podia', 300), 'Ele queria ir, mas não podia');
  igual(ditarPausa('Ele queria ir', 'mas não podia', 900), 'Ele queria ir, mas não podia');
  igual(ditarPausa('Ele queria ir', 'mas não podia', 2000), 'Ele queria ir. Mas não podia');
});
teste('conjunção depois de nome do dicionário', () => {
  igual(ditar('', 0, 'chamou H mas ninguém veio').texto, 'Chamou Hán Lì 韩立, mas ninguém veio');
});
teste('pontuação automática desligada não muda nada', () => {
  const cfg = { ...SEM_GATILHO, pontuacaoAuto: false };
  igual(ditar('', 0, 'ele queria ir mas não podia', cfg).texto, 'Ele queria ir mas não podia');
});

// ---------- Ajustes de escrita ----------
teste('sem pontuação dupla', () => {
  igual(juntarPontuacao(',', '.'), '.');
  igual(juntarPontuacao('.', '.'), '.');
  igual(juntarPontuacao('.', ','), '.');
  igual(juntarPontuacao('.', '?'), '?');
  igual(juntarPontuacao('?', '.'), '?');
  igual(juntarPontuacao('?', '!'), '?!');
  igual(ditar('Ele saiu.', 9, 'vírgula').texto, 'Ele saiu.');
  igual(ditar('Ele saiu,', 9, 'ponto').texto, 'Ele saiu.');
  igual(ditar('Ele saiu.', 9, 'interrogação').texto, 'Ele saiu?');
});
teste('inserir pontuação antes de outra no texto não duplica', () => {
  igual(ditar('Ele saiu, e voltou', 8, 'ponto').texto, 'Ele saiu. E voltou');
  igual(ditar('Ele saiu.', 8, 'vírgula').texto, 'Ele saiu.');
});
teste('nome em minúscula depois do ponto não vira maiúscula', () => {
  igual(ditar('Ele sentiu qì fluir', 10, 'ponto').texto, 'Ele sentiu. qì fluir');
  igual(ditarPausa('Ele parou', '2M fluía', 2000), 'Ele parou. qì fluía');
});

// ---------- Modo teclado ----------
const IDX = construirIndice(DICIONARIO);
const tec = (texto, a = 0, b = texto.length, cfg = SEM_GATILHO) => {
  const r = ajustarTeclado(texto, a, b, IDX, cfg, NOMES);
  return r ? r.texto : texto;
};
teste('teclado: troca código digitado', () => {
  igual(tec('Ontem H chegou '), 'Ontem Hán Lì 韩立 chegou ');
  igual(tec('Ontem 2L chegou '), 'Ontem Lín Yǔ chegou ');
  igual(tec('Ele viu dois L '), 'Ele viu Lín Yǔ ');
});
teste('teclado: texto ditado pelo Gboard (já pontuado) mantém a pontuação dele', () => {
  igual(tec('Ele chegou, olhou para H. Quem é você? '), 'Ele chegou, olhou para Hán Lì 韩立. Quem é você? ');
  igual(tec('Era tarde mas ele ficou '), 'Era tarde mas ele ficou ');
});
teste('teclado: não troca palavras comuns sem gatilho', () => {
  // "a" é variação de H, mas ao digitar o artigo continua artigo.
  igual(tec('Ela viu a casa '), 'Ela viu a casa ');
});
teste('teclado: com gatilho ligado só troca depois da palavra-gatilho', () => {
  igual(tec('Ontem H viu código H ', 0, undefined, COM_GATILHO), 'Ontem H viu Hán Lì 韩立 ');
  igual(tec('Viu código a ', 0, undefined, COM_GATILHO), 'Viu Hán Lì 韩立 ');
});
teste('teclado: só mexe no trecho novo', () => {
  const antigo = 'H fica assim. ';
  igual(tec(antigo + 'Depois H ', antigo.length), antigo + 'Depois Hán Lì 韩立 ');
});
teste('teclado: nomes já no texto não são trocados de novo', () => {
  const dic = [...DICIONARIO, { id: '9', codigo: 'Li', variacoes: [], texto: 'Senhor Li', categoria: 'personagem' }];
  const idx = construirIndice(dic);
  igual(ajustarTeclado('Viu Hán Lì 韩立 ontem ', 0, 22, idx, SEM_GATILHO, dic.map((e) => e.texto)), null);
});
teste('teclado: espaço duplo, espaço antes de pontuação e pontuação dupla', () => {
  igual(tec('Ele  saiu , e voltou ,. Fim '), 'Ele saiu, e voltou. Fim ');
  igual(tec('Ele saiu.. Fim '), 'Ele saiu. Fim ');
  igual(tec('Talvez... ele volte '), 'Talvez... ele volte ');
});
teste('teclado: maiúscula depois de ponto, "?", "!" e nova linha', () => {
  igual(tec('ele saiu. depois voltou? sim! claro\nfim '), 'Ele saiu. Depois voltou? Sim! Claro\nFim ');
});
teste('teclado: nome do dicionário fica exatamente como cadastrado', () => {
  igual(tec('Ele parou. qì fluía '), 'Ele parou. qì fluía ');
  igual(tec('Ele parou. 2M fluía '), 'Ele parou. qì fluía ');
  igual(tec('Fim. iPhone novo '), 'Fim. iPhone novo ');
});
teste('teclado: respeita "maiúscula automática" desligada', () => {
  igual(tec('ele saiu. depois ', 0, undefined, { ...SEM_GATILHO, maiusculaAuto: false }), 'ele saiu. depois ');
});
teste('teclado: nunca acrescenta pontuação (não duplica a do teclado)', () => {
  const t = 'Ele chegou. Olhou em volta, e saiu ';
  igual(tec(t), t);
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
