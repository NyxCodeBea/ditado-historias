// ============================================================
// historias.js — Lista de histórias: criar, abrir, renomear,
// exportar e excluir (com confirmação).
// ============================================================

import * as db from './db.js';
import { el, icone, menu, pedirTexto, confirmar, aviso, formatarData, formatarNumero } from './ui.js';
import { exportarTxt, exportarDocx } from './exportar.js';
import { contarPalavras } from './texto.js';

const $ = (s) => document.querySelector(s);

export class TelaHistorias {
  constructor(ctx) {
    this.ctx = ctx;
    $('#nova-historia').innerHTML = icone('mais') + '<span class="uma-linha">Nova história</span>';
    $('#nova-historia').addEventListener('click', () => this.criar());
  }

  async mostrar() {
    const lista = await db.listarHistorias();
    const ul = $('#lista-historias');
    ul.replaceChildren();
    $('#historias-vazio').hidden = lista.length > 0;
    for (const h of lista) {
      const palavras = h.palavras ?? contarPalavras(h.texto);
      ul.append(el('li', { class: 'cartao-item' },
        el('button', { class: 'abrir', type: 'button', onclick: () => this.ctx.abrirHistoria(h.id) },
          el('span', { class: 'cartao-titulo uma-linha' }, h.titulo),
          el('span', { class: 'cartao-meta uma-linha' },
            `${formatarNumero(palavras)} ${palavras === 1 ? 'palavra' : 'palavras'} · ${formatarData(h.atualizadoEm)}`)),
        el('button', {
          class: 'botao-icone', type: 'button', 'aria-label': `Opções de ${h.titulo}`,
          html: icone('menu'), onclick: () => this.opcoes(h),
        })));
    }
  }

  async criar() {
    const titulo = await pedirTexto('Nova história', '', 'Título da história');
    if (titulo === null) return;
    const agora = Date.now();
    const h = {
      id: db.novoId(),
      titulo: titulo || 'História sem título',
      texto: '',
      palavras: 0,
      criadoEm: agora,
      atualizadoEm: agora,
    };
    await db.salvarHistoria(h);
    this.ctx.abrirHistoria(h.id);
  }

  async opcoes(h) {
    const escolha = await menu(h.titulo, [
      { texto: 'Abrir', icone: 'livro', valor: 'abrir' },
      { texto: 'Renomear', icone: 'editar', valor: 'renomear' },
      { texto: 'Baixar .docx (Word)', icone: 'baixar', valor: 'docx' },
      { texto: 'Baixar .txt', icone: 'baixar', valor: 'txt' },
      { texto: 'Excluir', icone: 'lixeira', valor: 'excluir', perigo: true },
    ]);
    if (escolha === 'abrir') this.ctx.abrirHistoria(h.id);
    if (escolha === 'renomear') {
      const novo = await pedirTexto('Renomear história', h.titulo, 'Título');
      if (novo === null) return;
      h.titulo = novo || 'História sem título';
      h.atualizadoEm = Date.now();
      await db.salvarHistoria(h);
      this.mostrar();
    }
    if (escolha === 'docx') exportarDocx(h, false);
    if (escolha === 'txt') exportarTxt(h, false);
    if (escolha === 'excluir') {
      const ok = await confirmar('Excluir história?', `“${h.titulo}” será apagada deste celular. Isso não pode ser desfeito.`);
      if (!ok) return;
      await db.excluirHistoria(h.id);
      aviso('História excluída');
      this.mostrar();
    }
  }
}
