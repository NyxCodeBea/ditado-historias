// ============================================================
// editor.js — Tela principal: ditado, inserção no cursor,
// barra de nomes, pontuação, desfazer e salvamento automático.
// ============================================================

import {
  analisarTrecho, montarInsercao, previaParcial, contarPalavras, normalizar, textoParaCopiar,
  pontuarAuto, ajustarTeclado,
} from './texto.js';
import { Ditado } from './voz.js';
import * as db from './db.js';
import { el, icone, aviso, menu, pedirTexto, confirmar, formatarNumero } from './ui.js';
import { exportarTxt, exportarDocx, podeCompartilharArquivos } from './exportar.js';

const $ = (s) => document.querySelector(s);

// Botões de pontuação → peças de texto.
const PECAS_BOTOES = {
  ',': { tipo: 'pont', texto: ',' },
  '.': { tipo: 'pont', texto: '.' },
  '?': { tipo: 'pont', texto: '?' },
  '!': { tipo: 'pont', texto: '!' },
  ':': { tipo: 'pont', texto: ':' },
  '…': { tipo: 'pont', texto: '…' },
  travessao: { tipo: 'travessao' },
  aspas: { tipo: 'aspas' },
  paragrafo: { tipo: 'paragrafo' },
  linha: { tipo: 'linha' },
};

const LIMITE_DESFAZER = 200;
const ESPERA_TECLADO = 700; // ms sem digitar antes de ajustar o texto do teclado

export class Editor {
  constructor(ctx) {
    this.ctx = ctx;
    this.ta = $('#ed-texto');
    this.tela = $('#tela-editor');
    this.mic = $('#ed-mic');
    this.status = $('#ed-status');
    this.historia = null;
    this.cursor = 0;
    this.regiao = null;        // trecho provisório { inicio, fim } dentro do texto
    this.parcial = '';         // texto provisório reconhecido
    this.pilha = [];           // estados para desfazer
    this.estadoAnterior = null;
    this.ultimaDigitacao = 0;
    this.bloqueioTela = null;
    this.temposParcial = null; // { inicio, fim } do texto provisório
    this.ultimoFalado = null;  // { fim, pos, valor } do último trecho ditado pelo app
    this.sujo = null;          // trecho vindo do teclado ainda não ajustado { ini, fim }
    this.compondo = false;     // teclado no meio de uma palavra (composição)

    this.voz = new Ditado({
      aoParcial: (t, tempos) => this.aoParcial(t, tempos),
      aoFinal: (t, tempos) => this.aoFinal(t, tempos),
      aoFimSessao: () => this.aoFimSessao(),
      aoEstado: (e) => this.aoEstadoVoz(e),
      aoErro: (m) => aviso(m, 5000),
    });

    this.montarIcones();
    this.ligarEventos();
  }

  // ---------- Montagem ----------

  montarIcones() {
    $('#ed-voltar').innerHTML = icone('voltar');
    $('#ed-menu').innerHTML = icone('menu');
    $('#ed-copiar').innerHTML = icone('copiar', 20) + '<span>Copiar</span>';
    $('#ed-desfazer').innerHTML = icone('desfazer');
    $('#ed-linha').innerHTML = icone('enter');
    $('#ed-busca-nomes').innerHTML = icone('busca', 20);
    this.mic.innerHTML = icone('mic');
  }

  ligarEventos() {
    const ta = this.ta;

    // Guarda a posição do cursor sempre que ela muda.
    document.addEventListener('selectionchange', () => {
      if (document.activeElement === ta && !this.regiao) this.cursor = ta.selectionStart;
    });
    ta.addEventListener('keyup', () => { if (!this.regiao) this.cursor = ta.selectionStart; });
    ta.addEventListener('click', () => { if (!this.regiao) this.cursor = ta.selectionStart; });

    // Tocar no texto enquanto há texto provisório: confirma o provisório.
    ta.addEventListener('pointerdown', () => { if (this.regiao) this.confirmarParcial(); });

    // Modo teclado: guarda onde o teclado mexeu no texto.
    ta.addEventListener('compositionstart', () => { this.compondo = true; });
    ta.addEventListener('compositionend', () => { this.compondo = false; this.agendarTeclado(); });
    ta.addEventListener('beforeinput', (e) => {
      if (this.regiao) return;
      const tipo = e.inputType || '';
      const p = ta.selectionStart;
      if (tipo.startsWith('history')) { this.sujo = null; return; }
      if (tipo.startsWith('delete')) {
        if (this.sujo) this.sujo.ini = Math.min(this.sujo.ini, Math.max(0, p - 1));
        return;
      }
      if (!this.sujo) this.sujo = { ini: p, fim: p };
      else this.sujo.ini = Math.min(this.sujo.ini, p);
    });

    // Edição à mão.
    ta.addEventListener('input', (e) => {
      if (this.regiao) {
        // A pessoa digitou com texto provisório na tela: ele fica como está.
        this.regiao = null;
        this.parcial = '';
        this.voz.descartarEReiniciar();
      }
      const agora = Date.now();
      if (this.estadoAnterior && agora - this.ultimaDigitacao > 1200) this.empilhar(this.estadoAnterior);
      this.ultimaDigitacao = agora;
      this.cursor = ta.selectionStart;
      this.estadoAnterior = { valor: ta.value, cursor: this.cursor };
      const tipo = e.inputType || '';
      if (!this.sujo && tipo.startsWith('insert')) {
        // Navegadores sem "beforeinput": estima pelo tamanho do que entrou.
        const p = Math.max(0, this.cursor - ((e.data && e.data.length) || 1));
        this.sujo = { ini: p, fim: p };
      }
      if (this.sujo) {
        this.sujo.ini = Math.min(this.sujo.ini, ta.value.length);
        this.sujo.fim = Math.min(Math.max(this.sujo.fim, this.cursor), ta.value.length);
        if (!e.isComposing) this.agendarTeclado();
      }
      this.aoMudarTexto();
    });
    ta.addEventListener('blur', () => this.processarTeclado(true));

    // Botões que não devem tirar o foco do texto (para não fechar o teclado).
    const manterFoco = (b) => b.addEventListener('pointerdown', (e) => {
      if (document.activeElement === ta) e.preventDefault();
    });

    for (const b of document.querySelectorAll('#ed-pontuacao .tecla')) {
      manterFoco(b);
      b.addEventListener('click', () => this.inserirBotao(PECAS_BOTOES[b.dataset.peca]));
    }
    const linha = $('#ed-linha');
    manterFoco(linha);
    linha.addEventListener('click', () => this.inserirBotao(PECAS_BOTOES.linha));

    const desfazer = $('#ed-desfazer');
    manterFoco(desfazer);
    desfazer.addEventListener('click', () => this.desfazer());

    // Copiar: guarda a seleção no instante do toque (antes que ela possa sumir)
    // e copia direto no clique — o iPhone só permite copiar dentro do toque.
    const copiar = $('#ed-copiar');
    let selecaoNoToque = null;
    const guardarSelecao = () => {
      selecaoNoToque = document.activeElement === ta
        ? { inicio: ta.selectionStart, fim: ta.selectionEnd }
        : null;
    };
    copiar.addEventListener('pointerdown', (e) => {
      guardarSelecao();
      if (document.activeElement === ta) e.preventDefault();
    });
    copiar.addEventListener('click', () => {
      if (!selecaoNoToque) guardarSelecao();
      this.copiar(selecaoNoToque);
      selecaoNoToque = null;
    });

    this.mic.addEventListener('click', () => this.alternarMicrofone());

    // Barra de nomes.
    const nomes = $('#ed-nomes');
    nomes.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.chip') && document.activeElement === ta) e.preventDefault();
    });
    nomes.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      if (chip.dataset.acao === 'cadastrar') { location.hash = '#/dicionario'; return; }
      const entrada = this.ctx.dicionario.find((x) => x.id === chip.dataset.id);
      if (entrada) this.inserirNome(entrada);
    });

    const busca = $('#ed-busca-nomes');
    const filtro = $('#ed-filtro-nomes');
    busca.addEventListener('click', () => {
      const abrir = filtro.hidden;
      filtro.hidden = !abrir;
      busca.classList.toggle('ativo', abrir);
      if (abrir) filtro.focus();
      else { filtro.value = ''; this.atualizarNomes(); }
    });
    filtro.addEventListener('input', () => this.atualizarNomes());

    $('#ed-voltar').addEventListener('click', () => this.ctx.voltarParaLista());
    $('#ed-cabecalho').addEventListener('click', () => this.renomear());
    $('#ed-menu').addEventListener('click', () => this.abrirMenu());

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && this.historia) {
        if (this.voz.ligado) this.voz.parar();
        this.salvarAgora();
      } else if (document.visibilityState === 'visible' && this.voz.ligado) {
        this.pedirTelaLigada();
      }
    });
  }

  // ---------- Abrir / fechar ----------

  abrir(historia) {
    this.historia = historia;
    this.ta.value = historia.texto || '';
    this.cursor = this.ta.value.length;
    this.regiao = null;
    this.parcial = '';
    this.pilha = [];
    this.estadoAnterior = { valor: this.ta.value, cursor: this.cursor };
    this.ultimaDigitacao = 0;
    this.ultimoFalado = null;
    this.temposParcial = null;
    this.sujo = null;
    this.compondo = false;
    $('#ed-titulo').textContent = historia.titulo;
    $('#ed-filtro-nomes').value = '';
    $('#ed-filtro-nomes').hidden = true;
    $('#ed-busca-nomes').classList.remove('ativo');
    this.atualizarNomes();
    this.atualizarContagem();
    this.atualizarDesfazer();
    this.marcarSalvo(true);
    this.aoEstadoVoz('parado');
    requestAnimationFrame(() => { this.ta.scrollTop = this.ta.scrollHeight; });
  }

  async fechar() {
    if (!this.historia) return;
    if (this.voz.ligado) this.voz.parar();
    if (this.regiao) this.aoFimSessao();
    this.processarTeclado(true);
    await this.salvarAgora();
    this.historia = null;
  }

  // ---------- Microfone ----------

  alternarMicrofone() {
    if (this.voz.ligado) {
      this.voz.parar();
    } else {
      if (!Ditado.suportado()) {
        aviso('Este navegador não tem reconhecimento de voz. Use o Chrome no Android ou o Safari no iPhone.', 5000);
        return;
      }
      if (document.activeElement === this.ta) this.cursor = this.ta.selectionStart;
      this.processarTeclado(true);
      // A pausa só conta entre trechos da mesma escuta.
      this.ultimoFalado = null;
      this.voz.iniciar();
    }
  }

  aoEstadoVoz(estado) {
    const m = this.mic;
    m.classList.toggle('ouvindo', estado === 'ouvindo');
    m.classList.toggle('iniciando', estado === 'iniciando');
    this.tela.classList.toggle('ouvindo', estado === 'ouvindo');
    const ligado = estado !== 'parado';
    m.setAttribute('aria-pressed', String(ligado));
    m.setAttribute('aria-label', ligado ? 'Pausar ditado' : 'Começar a ditar');
    m.innerHTML = icone(ligado ? 'pausa' : 'mic');
    this.status.textContent = estado === 'ouvindo' ? 'Ouvindo…' : estado === 'iniciando' ? 'Ligando…' : 'Toque para ditar';
    if (estado === 'ouvindo') this.pedirTelaLigada();
    if (estado === 'parado') this.liberarTela();
  }

  // Mantém a tela acesa enquanto dita (quando o celular permite).
  async pedirTelaLigada() {
    try {
      if ('wakeLock' in navigator && !this.bloqueioTela) {
        this.bloqueioTela = await navigator.wakeLock.request('screen');
        this.bloqueioTela.addEventListener('release', () => { this.bloqueioTela = null; });
      }
    } catch { /* sem suporte ou negado */ }
  }

  liberarTela() {
    if (this.bloqueioTela) { this.bloqueioTela.release().catch(() => {}); this.bloqueioTela = null; }
  }

  // ---------- Texto provisório e final ----------

  posicaoCursor() {
    if (document.activeElement === this.ta && !this.regiao) this.cursor = this.ta.selectionStart;
    return Math.max(0, Math.min(this.cursor, this.ta.value.length));
  }

  aoParcial(texto, tempos) {
    this.temposParcial = tempos || null;
    const t = (texto || '').trim();
    if (!t) {
      if (this.regiao) { this.removerParcial(); this.posicionar(this.cursor); }
      return;
    }
    const v = this.ta.value;
    if (!this.regiao) {
      const pos = this.posicaoCursor();
      this.regiao = { inicio: pos, fim: pos };
    }
    const antes = v.slice(0, this.regiao.inicio);
    const previa = previaParcial(antes, t);
    this.ta.value = antes + previa + v.slice(this.regiao.fim);
    this.regiao.fim = this.regiao.inicio + previa.length;
    this.parcial = t;
    this.posicionar(this.regiao.fim);
    this.agendarContagem();
  }

  removerParcial() {
    if (!this.regiao) return;
    const v = this.ta.value;
    this.ta.value = v.slice(0, this.regiao.inicio) + v.slice(this.regiao.fim);
    this.cursor = this.regiao.inicio;
    this.regiao = null;
    this.parcial = '';
  }

  aoFinal(texto, tempos) {
    let pos;
    if (this.regiao) { pos = this.regiao.inicio; this.removerParcial(); }
    else pos = this.posicaoCursor();
    this.temposParcial = null;
    this.inserirFalado(texto, pos, tempos);
  }

  /** Tempos do texto provisório atual (para pontuar pela pausa). */
  temposDoParcial() {
    const t = this.temposParcial;
    this.temposParcial = null;
    if (!t || t.inicio == null) return null;
    return { inicio: t.inicio, fim: t.fim ?? Date.now() };
  }

  /** O navegador encerrou a escuta: o que estava provisório vira definitivo. */
  aoFimSessao() {
    if (!this.regiao) return;
    const t = this.parcial;
    const pos = this.regiao.inicio;
    const tempos = this.temposDoParcial();
    this.removerParcial();
    if (t) this.inserirFalado(t, pos, tempos);
  }

  /** Confirma o texto provisório agora (antes de inserir um nome, por exemplo). */
  confirmarParcial() {
    if (!this.regiao) return false;
    const t = this.parcial;
    const pos = this.regiao.inicio;
    const tempos = this.temposDoParcial();
    this.removerParcial();
    if (t) this.inserirFalado(t, pos, tempos);
    // O reconhecedor ainda mandaria esse mesmo trecho: descarta e volta a ouvir.
    this.voz.descartarEReiniciar();
    return true;
  }

  inserirFalado(texto, pos, tempos = null) {
    const cfg = this.ctx.config;
    let pecas = analisarTrecho(texto, this.ctx.indice, cfg);
    if (cfg.pontuacaoAuto !== false) {
      // Só mede a pausa se este trecho continua exatamente onde o anterior terminou
      // e nada foi digitado ou inserido no meio (senão a pontuação já foi decidida).
      const u = this.ultimoFalado;
      const continua = u && tempos && u.pos === pos && u.valor === this.ta.value;
      pecas = pontuarAuto(this.ta.value.slice(0, pos), pecas, {
        pausa: continua ? Math.max(0, tempos.inicio - u.fim) : null,
        curta: cfg.pausaCurta,
        longa: cfg.pausaLonga,
      });
    }
    this.inserirPecas(pecas, pos);
    this.ultimoFalado = tempos ? { fim: tempos.fim, pos: this.cursor, valor: this.ta.value } : null;
  }

  inserirPecas(pecas, pos) {
    if (!pecas || !pecas.length) return;
    const v = this.ta.value;
    this.empilhar({ valor: v, cursor: pos });
    const nomes = this.ctx.dicionario.map((e) => e.texto);
    const r = montarInsercao(v.slice(0, pos), pecas, v.slice(pos), this.ctx.config, nomes);
    this.definirTexto(r.texto, r.cursor);
    for (const p of pecas) if (p.tipo === 'nome' && p.id) this.ctx.registrarUso(p.id);
    this.aoMudarTexto();
  }

  inserirBotao(peca) {
    if (!peca) return;
    this.confirmarParcial();
    this.inserirPecas([{ ...peca }], this.posicaoCursor());
  }

  inserirNome(entrada) {
    this.confirmarParcial();
    this.inserirPecas([{ tipo: 'nome', texto: entrada.texto, id: entrada.id }], this.posicaoCursor());
    const filtro = $('#ed-filtro-nomes');
    if (!filtro.hidden && filtro.value) {
      filtro.value = '';
      filtro.hidden = true;
      $('#ed-busca-nomes').classList.remove('ativo');
      if (document.activeElement === filtro) filtro.blur();
      this.atualizarNomes();
    }
  }

  definirTexto(valor, cursor) {
    this.ta.value = valor;
    this.estadoAnterior = { valor, cursor };
    this.ultimaDigitacao = 0;
    this.posicionar(cursor);
  }

  posicionar(cursor) {
    this.cursor = cursor;
    if (document.activeElement === this.ta) {
      try { this.ta.setSelectionRange(cursor, cursor); } catch { /* ignora */ }
    }
    this.rolarAteCursor(cursor);
  }

  // Rola o texto para o ponto onde o cursor está (mesmo com o teclado fechado).
  rolarAteCursor(pos) {
    const ta = this.ta;
    if (pos >= ta.value.length - 1) { ta.scrollTop = ta.scrollHeight; return; }
    const estilo = getComputedStyle(ta);
    if (!this.espelho) {
      this.espelho = el('div', { 'aria-hidden': 'true' });
      Object.assign(this.espelho.style, {
        position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px',
        whiteSpace: 'pre-wrap', overflowWrap: 'break-word', wordWrap: 'break-word',
      });
      document.body.append(this.espelho);
    }
    const e = this.espelho;
    for (const p of ['fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'boxSizing']) {
      e.style[p] = estilo[p];
    }
    e.style.width = ta.clientWidth + 'px';
    e.textContent = ta.value.slice(0, pos);
    const marca = el('span', {}, '​');
    e.append(marca);
    const topo = marca.offsetTop;
    const alturaLinha = parseFloat(estilo.lineHeight) || 28;
    if (topo < ta.scrollTop) ta.scrollTop = topo - alturaLinha;
    else if (topo + alturaLinha > ta.scrollTop + ta.clientHeight) ta.scrollTop = topo - ta.clientHeight + alturaLinha * 2;
  }

  // ---------- Modo teclado ----------

  agendarTeclado() {
    if (this.ctx.config.modoTeclado === false) { this.sujo = null; return; }
    clearTimeout(this.tTeclado);
    this.tTeclado = setTimeout(() => this.processarTeclado(false), ESPERA_TECLADO);
  }

  /**
   * Ajusta o que entrou pelo teclado (códigos, espaços, maiúsculas).
   * Normal: só até o último espaço (a palavra em andamento fica para depois).
   * final=true: tudo (ao sair do texto, copiar, exportar, ligar o microfone).
   */
  processarTeclado(final = false) {
    clearTimeout(this.tTeclado);
    const s = this.sujo;
    if (!s || this.regiao) return;
    if (this.ctx.config.modoTeclado === false) { this.sujo = null; return; }
    if (this.compondo && !final) return;
    const ta = this.ta;
    const focado = document.activeElement === ta;
    if (focado && ta.selectionStart !== ta.selectionEnd && !final) return; // selecionando
    const v = ta.value;
    const fim = Math.min(s.fim, v.length);
    let lim = fim;
    if (!final) {
      const trecho = v.slice(s.ini, fim);
      const k = Math.max(trecho.lastIndexOf(' '), trecho.lastIndexOf('\n'), trecho.lastIndexOf('\t'));
      if (k < 0) return;
      lim = s.ini + k + 1;
    }
    if (lim <= s.ini) { if (final) this.sujo = null; return; }
    const nomes = this.ctx.dicionario.map((e) => e.texto);
    const r = ajustarTeclado(v, s.ini, lim, this.ctx.indice, this.ctx.config, nomes);
    const delta = r ? r.delta : 0;
    this.sujo = fim > lim ? { ini: lim + delta, fim: fim + delta } : null;
    if (!r) return;
    const cursorAntes = focado ? ta.selectionStart : this.cursor;
    const cursor = cursorAntes >= lim ? cursorAntes + delta : Math.min(cursorAntes, lim + delta);
    this.empilhar({ valor: v, cursor: cursorAntes });
    this.definirTexto(r.texto, cursor);
    for (const id of r.ids) this.ctx.registrarUso(id);
    this.aoMudarTexto();
  }

  // ---------- Copiar ----------

  copiar(selecao) {
    const tem = selecao && selecao.fim > selecao.inicio;
    if (!tem) this.processarTeclado(true);
    const { texto } = tem
      ? textoParaCopiar(this.ta.value, selecao.inicio, selecao.fim)
      : textoParaCopiar(this.textoSemParcial());
    if (!texto.trim()) { aviso('Nada para copiar'); return; }

    // Plano B (navegadores antigos): copia por um campo escondido.
    const copiarAntigo = () => {
      const aux = el('textarea', { readonly: true, 'aria-hidden': 'true', style: 'position:fixed;top:0;left:0;opacity:0;font-size:16px' });
      aux.value = texto;
      document.body.append(aux);
      aux.focus();
      aux.setSelectionRange(0, texto.length);
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      aux.remove();
      if (tem) {
        // Devolve a seleção ao texto.
        this.ta.focus();
        this.ta.setSelectionRange(selecao.inicio, selecao.fim);
      }
      return ok;
    };

    // Chamado sem nenhum "await" antes: continua dentro do toque.
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(texto)
        .then(() => aviso('Copiado!'))
        .catch(() => aviso(copiarAntigo() ? 'Copiado!' : 'Não consegui copiar. Selecione o texto e use “Copiar” do celular.', 4000));
    } else {
      aviso(copiarAntigo() ? 'Copiado!' : 'Não consegui copiar. Selecione o texto e use “Copiar” do celular.', 4000);
    }
  }

  // ---------- Desfazer ----------

  empilhar(estado) {
    const topo = this.pilha[this.pilha.length - 1];
    if (topo && topo.valor === estado.valor) return;
    this.pilha.push(estado);
    if (this.pilha.length > LIMITE_DESFAZER) this.pilha.shift();
    this.atualizarDesfazer();
  }

  desfazer() {
    if (this.regiao) {
      // Primeiro desfaz o que ainda está sendo ouvido.
      this.removerParcial();
      this.voz.descartarEReiniciar();
      this.posicionar(this.cursor);
      return;
    }
    const e = this.pilha.pop();
    if (!e) { aviso('Nada para desfazer'); return; }
    this.definirTexto(e.valor, e.cursor);
    this.atualizarDesfazer();
    this.aoMudarTexto();
  }

  atualizarDesfazer() {
    $('#ed-desfazer').disabled = this.pilha.length === 0;
  }

  // ---------- Salvar e contar ----------

  textoSemParcial() {
    const v = this.ta.value;
    if (!this.regiao) return v;
    return v.slice(0, this.regiao.inicio) + v.slice(this.regiao.fim);
  }

  aoMudarTexto() {
    this.agendarContagem();
    this.marcarSalvo(false);
    clearTimeout(this.tSalvar);
    this.tSalvar = setTimeout(() => this.salvarAgora(), 800);
  }

  async salvarAgora() {
    clearTimeout(this.tSalvar);
    const h = this.historia;
    if (!h) return;
    const texto = this.textoSemParcial();
    if (texto !== h.texto) {
      h.texto = texto;
      h.palavras = contarPalavras(texto);
      h.atualizadoEm = Date.now();
      try {
        await db.salvarHistoria(h);
      } catch (e) {
        aviso('Não consegui salvar: ' + (e.message || e), 5000);
        return;
      }
    }
    if (this.historia === h) this.marcarSalvo(true);
  }

  marcarSalvo(salvo) {
    $('#ed-salvo').textContent = salvo ? 'Salvo' : 'Salvando…';
  }

  agendarContagem() {
    clearTimeout(this.tContagem);
    this.tContagem = setTimeout(() => this.atualizarContagem(), 300);
  }

  atualizarContagem() {
    const n = contarPalavras(this.ta.value);
    $('#ed-palavras').textContent = `${formatarNumero(n)} ${n === 1 ? 'palavra' : 'palavras'}`;
  }

  // ---------- Barra de nomes ----------

  atualizarNomes() {
    const caixa = $('#ed-nomes');
    const busca = normalizar($('#ed-filtro-nomes').value);
    const lista = [...this.ctx.dicionario]
      .filter((e) => !busca || [e.texto, e.codigo, ...(e.variacoes || [])].some((x) => normalizar(x).includes(busca)))
      .sort((a, b) => (b.usos || 0) - (a.usos || 0) || a.texto.localeCompare(b.texto, 'pt-BR'));
    caixa.replaceChildren();
    if (!this.ctx.dicionario.length) {
      caixa.append(el('button', { class: 'chip chip-vazio', type: 'button', 'data-acao': 'cadastrar' }, 'Cadastre nomes no Dicionário'));
      return;
    }
    if (!lista.length) {
      caixa.append(el('span', { class: 'chip chip-vazio' }, 'Nenhum nome encontrado'));
      return;
    }
    for (const e of lista) {
      caixa.append(el('button', {
        class: 'chip', type: 'button', 'data-id': e.id,
        title: `${e.texto} — código ${e.codigo}`,
        'aria-label': `Inserir ${e.texto}`,
      }, el('span', { class: `ponto-cat cat-${e.categoria || 'outro'}` }), el('span', { class: 'uma-linha' }, e.texto)));
    }
  }

  // ---------- Menu e título ----------

  async renomear() {
    if (!this.historia) return;
    const novo = await pedirTexto('Renomear história', this.historia.titulo, 'Título');
    if (novo === null) return;
    this.historia.titulo = novo || 'História sem título';
    this.historia.atualizadoEm = Date.now();
    $('#ed-titulo').textContent = this.historia.titulo;
    await db.salvarHistoria({ ...this.historia, texto: this.textoSemParcial() });
  }

  async abrirMenu() {
    if (!this.historia) return;
    if (this.regiao) this.confirmarParcial();
    this.processarTeclado(true);
    await this.salvarAgora();
    const compartilhar = podeCompartilharArquivos();
    const escolha = await menu(this.historia.titulo, [
      { texto: 'Renomear', icone: 'editar', valor: 'renomear' },
      { texto: 'Baixar .docx (Word)', icone: 'baixar', valor: 'docx' },
      { texto: 'Baixar .txt', icone: 'baixar', valor: 'txt' },
      { texto: 'Compartilhar .docx', icone: 'compartilhar', valor: 'docx-c', oculta: !compartilhar },
      { texto: 'Compartilhar .txt', icone: 'compartilhar', valor: 'txt-c', oculta: !compartilhar },
      { texto: 'Excluir história', icone: 'lixeira', valor: 'excluir', perigo: true },
    ]);
    const h = this.historia;
    if (!h || !escolha) return;
    if (escolha === 'renomear') return this.renomear();
    if (escolha === 'docx') return exportarDocx(h, false);
    if (escolha === 'txt') return exportarTxt(h, false);
    if (escolha === 'docx-c') return exportarDocx(h, true);
    if (escolha === 'txt-c') return exportarTxt(h, true);
    if (escolha === 'excluir') {
      const ok = await confirmar('Excluir história?', `“${h.titulo}” será apagada deste celular. Isso não pode ser desfeito.`);
      if (!ok) return;
      if (this.voz.ligado) this.voz.parar();
      await db.excluirHistoria(h.id);
      this.historia = null;
      aviso('História excluída');
      this.ctx.voltarParaLista(true);
    }
  }
}
