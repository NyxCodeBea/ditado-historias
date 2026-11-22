// ============================================================
// ajustes.js — Tela de configurações e backup completo.
// ============================================================

import * as db from './db.js';
import { Ditado } from './voz.js';
import { abrirJanela, confirmar, aviso, el, escolherArquivo, formatarData } from './ui.js';
import { entregar } from './exportar.js';

const $ = (s) => document.querySelector(s);

export class TelaAjustes {
  constructor(ctx) {
    this.ctx = ctx;

    for (const b of document.querySelectorAll('#aj-tema button')) {
      b.addEventListener('click', () => this.ctx.mudarConfig('tema', b.dataset.valor).then(() => this.mostrar()));
    }
    const tam = $('#aj-tamanho');
    tam.addEventListener('input', () => {
      $('#aj-tamanho-valor').textContent = tam.value;
      this.ctx.mudarConfig('tamanhoTexto', Number(tam.value));
    });
    $('#aj-gatilho-ativo').addEventListener('change', (e) => this.ctx.mudarConfig('gatilhoAtivo', e.target.checked));
    $('#aj-gatilho').addEventListener('change', (e) => {
      const v = e.target.value.trim() || 'código';
      e.target.value = v;
      this.ctx.mudarConfig('palavraGatilho', v);
    });
    $('#aj-comandos').addEventListener('change', (e) => this.ctx.mudarConfig('comandosFalados', e.target.checked));
    $('#aj-maiuscula').addEventListener('change', (e) => this.ctx.mudarConfig('maiusculaAuto', e.target.checked));
    $('#aj-pont-auto').addEventListener('change', (e) => this.ctx.mudarConfig('pontuacaoAuto', e.target.checked));
    $('#aj-teclado').addEventListener('change', (e) => this.ctx.mudarConfig('modoTeclado', e.target.checked));
    // A pausa longa (ponto) é sempre maior que a curta (vírgula).
    const curta = $('#aj-pausa-curta');
    const longa = $('#aj-pausa-longa');
    curta.addEventListener('input', () => {
      const v = Number(curta.value);
      this.ctx.mudarConfig('pausaCurta', v);
      if (Number(longa.value) < v + 300) {
        longa.value = Math.min(Number(longa.max), v + 300);
        this.ctx.mudarConfig('pausaLonga', Number(longa.value));
      }
      this.mostrarPausas();
    });
    longa.addEventListener('input', () => {
      let v = Number(longa.value);
      if (v < Number(curta.value) + 300) { v = Number(curta.value) + 300; longa.value = v; }
      this.ctx.mudarConfig('pausaLonga', v);
      this.mostrarPausas();
    });
    $('#aj-pausa-padrao').addEventListener('click', async () => {
      await this.ctx.mudarConfig('pausaCurta', db.CONFIG_PADRAO.pausaCurta);
      await this.ctx.mudarConfig('pausaLonga', db.CONFIG_PADRAO.pausaLonga);
      this.mostrar();
    });
    $('#aj-backup').addEventListener('click', () => this.backup());
    $('#aj-restaurar').addEventListener('click', () => this.restaurar());
  }

  mostrar() {
    const c = this.ctx.config;
    for (const b of document.querySelectorAll('#aj-tema button')) {
      const ativo = b.dataset.valor === c.tema;
      b.classList.toggle('ativo', ativo);
      b.setAttribute('aria-checked', String(ativo));
      b.setAttribute('role', 'radio');
    }
    $('#aj-tamanho').value = c.tamanhoTexto;
    $('#aj-tamanho-valor').textContent = c.tamanhoTexto;
    $('#aj-gatilho-ativo').checked = !!c.gatilhoAtivo;
    $('#aj-gatilho').value = c.palavraGatilho;
    $('#aj-comandos').checked = c.comandosFalados !== false;
    $('#aj-maiuscula').checked = c.maiusculaAuto !== false;
    $('#aj-pont-auto').checked = c.pontuacaoAuto !== false;
    $('#aj-teclado').checked = c.modoTeclado !== false;
    $('#aj-pausa-curta').value = c.pausaCurta;
    $('#aj-pausa-longa').value = c.pausaLonga;
    this.mostrarPausas();
    $('#aj-voz-status').textContent = Ditado.suportado()
      ? 'Reconhecimento de voz disponível neste navegador. Ele usa a internet para entender a fala.'
      : 'Este navegador não tem reconhecimento de voz. Use o Chrome (Android) ou o Safari (iPhone).';
    $('#aj-ultimo-backup').textContent = c.ultimoBackup
      ? `Último backup: ${formatarData(c.ultimoBackup)}.`
      : 'Você ainda não fez nenhum backup.';
    $('#aj-versao').textContent = this.ctx.versao;
  }

  mostrarPausas() {
    const seg = (ms) => `${(Number(ms) / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
    $('#aj-pausa-curta-valor').textContent = seg($('#aj-pausa-curta').value);
    $('#aj-pausa-longa-valor').textContent = seg($('#aj-pausa-longa').value);
  }

  async backup() {
    const dados = await db.exportarTudo();
    const data = new Date().toISOString().slice(0, 10);
    await entregar(`ditado-historias-backup-${data}.json`, JSON.stringify(dados, null, 2), 'json', false);
    await this.ctx.mudarConfig('ultimoBackup', Date.now());
    this.mostrar();
  }

  async restaurar() {
    const texto = await escolherArquivo();
    if (!texto) return;
    let dados;
    try { dados = JSON.parse(texto); } catch { aviso('Arquivo inválido: não é um JSON.'); return; }
    if (!dados || dados.app !== 'ditado-historias' || dados.tipo !== 'backup') {
      aviso('Este arquivo não é um backup do Ditado de Histórias. Para dicionário, use a tela Dicionário.', 5000);
      return;
    }
    const nH = (dados.historias || []).length;
    const nD = (dados.dicionario || []).length;
    const ok = await confirmar('Restaurar backup?',
      `${nH} histórias e ${nD} entradas do dicionário serão gravadas. Itens com o mesmo identificador serão substituídos pela versão do backup; os outros continuam.`,
      'Restaurar', false);
    if (!ok) return;
    await db.importarTudo(dados);
    await this.ctx.recarregarTudo();
    this.mostrar();
    aviso('Backup restaurado');
  }
}

// Usado em app.js para lembrar de fazer backup de vez em quando.
export async function lembrarBackup(ctx) {
  const c = ctx.config;
  const semana = 7 * 24 * 3600 * 1000;
  const historias = await db.listarHistorias();
  const palavras = historias.reduce((s, h) => s + (h.palavras || 0), 0);
  if (palavras < 500) return;
  const ultimo = Math.max(c.ultimoBackup || 0, c.lembreteBackupEm || 0);
  if (ultimo && Date.now() - ultimo < 2 * semana) return;
  await ctx.mudarConfig('lembreteBackupEm', Date.now());
  const r = await abrirJanela({
    titulo: 'Que tal um backup?',
    conteudo: el('p', { class: 'texto-janela' },
      'Suas histórias ficam só neste celular. Um backup em JSON (guardado no Drive ou no e-mail) protege tudo se o celular for trocado ou limpo.'),
    botoes: [
      { texto: 'Agora não', valor: null, classe: 'secundario' },
      { texto: 'Fazer backup', valor: 'ok', classe: 'principal' },
    ],
  });
  if (r === 'ok') ctx.telas.ajustes.backup();
}
