// ============================================================
// app.js — Início do app: carrega dados, navega entre telas,
// aplica o tema e registra o modo offline (service worker).
// ============================================================

import * as db from './db.js';
import { construirIndice } from './texto.js';
import { icone, aviso } from './ui.js';
import { Editor } from './editor.js';
import { TelaHistorias } from './historias.js';
import { TelaDicionario } from './dicionario.js';
import { TelaAjustes, lembrarBackup } from './ajustes.js';

export const VERSAO = '1.0.0';

// Estado compartilhado entre as telas.
const ctx = {
  versao: VERSAO,
  config: { ...db.CONFIG_PADRAO },
  dicionario: [],
  indice: construirIndice([]),
  telas: {},
  veioDaLista: false,

  async recarregarDicionario() {
    this.dicionario = await db.listarDicionario();
    this.indice = construirIndice(this.dicionario);
    this.telas.editor?.atualizarNomes();
  },

  async recarregarTudo() {
    this.config = await db.lerConfig();
    aplicarAparencia();
    await this.recarregarDicionario();
  },

  async mudarConfig(chave, valor) {
    this.config[chave] = valor;
    aplicarAparencia();
    await db.gravarConfig(chave, valor);
  },

  // Conta quantas vezes cada nome é usado (os mais usados ficam primeiro na barra).
  registrarUso(id) {
    const e = this.dicionario.find((x) => x.id === id);
    if (!e) return;
    e.usos = (e.usos || 0) + 1;
    db.salvarEntrada(e).catch(() => {});
  },

  abrirHistoria(id) {
    this.veioDaLista = true;
    location.hash = `#/editor/${id}`;
  },

  voltarParaLista(substituir = false) {
    if (this.veioDaLista && !substituir) history.back();
    else location.replace('#/historias');
    this.veioDaLista = false;
  },
};

function aplicarAparencia() {
  const raiz = document.documentElement;
  if (ctx.config.tema === 'auto') raiz.removeAttribute('data-tema');
  else raiz.setAttribute('data-tema', ctx.config.tema);
  raiz.style.setProperty('--tam-texto', `${ctx.config.tamanhoTexto}px`);
  const escuro = ctx.config.tema === 'escuro' ||
    (ctx.config.tema === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
    m.setAttribute('content', escuro ? '#1c1916' : '#f5eee3');
  }
}

// ---------- Navegação ----------

let telaAtual = null;

function mostrarTela(nome) {
  for (const s of document.querySelectorAll('.tela')) s.classList.toggle('ativa', s.id === `tela-${nome}`);
  for (const a of document.querySelectorAll('.aba')) a.classList.toggle('ativa', a.dataset.aba === nome);
  document.body.classList.toggle('modo-editor', nome === 'editor');
  telaAtual = nome;
}

async function rotear() {
  const [, tela = 'historias', id] = (location.hash || '#/historias').split('/');
  if (telaAtual === 'editor' && tela !== 'editor') await ctx.telas.editor.fechar();

  if (tela === 'editor') {
    const h = id && await db.obterHistoria(decodeURIComponent(id));
    if (!h) { location.replace('#/historias'); return; }
    if (telaAtual === 'editor' && ctx.telas.editor.historia?.id === h.id) return;
    mostrarTela('editor');
    ctx.telas.editor.abrir(h);
    return;
  }
  if (tela === 'dicionario') { mostrarTela('dicionario'); ctx.telas.dicionario.mostrar(); return; }
  if (tela === 'ajustes') { mostrarTela('ajustes'); ctx.telas.ajustes.mostrar(); return; }
  mostrarTela('historias');
  await ctx.telas.historias.mostrar();
}

// ---------- Altura da tela com teclado aberto ----------

function acompanharTeclado() {
  const vv = window.visualViewport;
  if (!vv) return;
  let alturaMaxima = vv.height;
  const ajustar = () => {
    alturaMaxima = Math.max(alturaMaxima, vv.height);
    document.documentElement.style.setProperty('--altura', `${vv.height}px`);
    document.body.classList.toggle('teclado-aberto', vv.height < alturaMaxima * 0.75);
    // No iPhone a página "sobe" quando o teclado abre; trazemos de volta.
    if (vv.offsetTop > 0) window.scrollTo(0, 0);
  };
  vv.addEventListener('resize', ajustar);
  vv.addEventListener('scroll', ajustar);
  window.addEventListener('orientationchange', () => { alturaMaxima = 0; setTimeout(ajustar, 300); });
  ajustar();
}

// ---------- Início ----------

async function iniciar() {
  for (const s of document.querySelectorAll('[data-icone]')) s.innerHTML = icone(s.dataset.icone, 22);

  try {
    ctx.config = await db.lerConfig();
    ctx.dicionario = await db.listarDicionario();
    ctx.indice = construirIndice(ctx.dicionario);
  } catch (e) {
    aviso('Não consegui abrir o armazenamento do celular: ' + (e.message || e), 8000);
  }
  aplicarAparencia();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', aplicarAparencia);

  ctx.telas.editor = new Editor(ctx);
  ctx.telas.historias = new TelaHistorias(ctx);
  ctx.telas.dicionario = new TelaDicionario(ctx);
  ctx.telas.ajustes = new TelaAjustes(ctx);

  // Só no computador, para testes: permite simular o ditado pelo console.
  if (['localhost', '127.0.0.1'].includes(location.hostname)) window.ditadoDebug = ctx;

  window.addEventListener('hashchange', rotear);
  acompanharTeclado();
  await rotear();

  db.pedirArmazenamentoPersistente();
  setTimeout(() => { if (telaAtual === 'historias') lembrarBackup(ctx); }, 1500);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

iniciar();
