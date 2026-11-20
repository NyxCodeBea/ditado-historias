// ============================================================
// editor.js — Tela principal: ditado, inserção no cursor,
// barra de nomes, pontuação, desfazer e salvamento automático.
// ============================================================

import { analisarTrecho, montarInsercao, previaParcial, contarPalavras, normalizar, textoParaCopiar } from './texto.js';
import { Ditado } from './voz.js';
import * as db from './db.js';
import { el, icone, aviso, menu, pedirTexto, confirmar, formatarNumero } from './ui.js';
import { exportarTxt, exportarDocx, podeCompartilharArquivos } from './exportar.js';
import { REVISAO_DISPONIVEL } from './revisao.js';

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

    this.voz = new Ditado({
      aoParcial: (t) => this.aoParcial(t),
      aoFinal: (t) => this.aoFinal(t),
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

    // Edição à mão.
    ta.addEventListener('input', () => {
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
      this.aoMudarTexto();
    });

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

  aoParcial(texto) {
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

  aoFinal(texto) {
    let pos;
    if (this.regiao) { pos = this.regiao.inicio; this.removerParcial(); }
    else pos = this.posicaoCursor();
    this.inserirFalado(texto, pos);
  }

  /** O navegador encerrou a escuta: o que estava provisório vira definitivo. */
  aoFimSessao() {
    if (!this.regiao) return;
    const t = this.parcial;
    const pos = this.regiao.inicio;
    this.removerParcial();
    if (t) this.inserirFalado(t, pos);
  }

  /** Confirma o texto provisório agora (antes de inserir um nome, por exemplo). */
  confirmarParcial() {
    if (!this.regiao) return false;
    const t = this.parcial;
    const pos = this.regiao.inicio;
    this.removerParcial();
    if (t) this.inserirFalado(t, pos);
    // O reconhecedor ainda mandaria esse mesmo trecho: descarta e volta a ouvir.
    this.voz.descartarEReiniciar();
    return true;
  }

  inserirFalado(texto, pos) {
    const pecas = analisarTrecho(texto, this.ctx.indice, this.ctx.config);
    this.inserirPecas(pecas, pos);
  }

  inserirPecas(pecas, pos) {
    if (!pecas || !pecas.length) return;
    const v = this.ta.value;
    this.empilhar({ valor: v, cursor: pos });
    const r = montarInsercao(v.slice(0, pos), pecas, v.slice(pos), this.ctx.config);
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

  // ---------- Copiar ----------

  copiar(selecao) {
    const tem = selecao && selecao.fim > selecao.inicio;
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
    await this.salvarAgora();
    const compartilhar = podeCompartilharArquivos();
    const escolha = await menu(this.historia.titulo, [
      { texto: 'Renomear', icone: 'editar', valor: 'renomear' },
      { texto: 'Baixar .docx (Word)', icone: 'baixar', valor: 'docx' },
      { texto: 'Baixar .txt', icone: 'baixar', valor: 'txt' },
      { texto: 'Compartilhar .docx', icone: 'compartilhar', valor: 'docx-c', oculta: !compartilhar },
      { texto: 'Compartilhar .txt', icone: 'compartilhar', valor: 'txt-c', oculta: !compartilhar },
      // FASE 2: aparece quando a revisão por IA estiver pronta.
      { texto: 'Revisar gramática', icone: 'revisar', valor: 'revisar', oculta: !REVISAO_DISPONIVEL },
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
