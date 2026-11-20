// ============================================================
// dicionario.js — Dicionário do Mundo: cadastrar, editar e
// excluir nomes/termos; exportar e importar em JSON.
// ============================================================

import * as db from './db.js';
import { el, icone, abrirJanela, confirmar, aviso, menu, escolherArquivo } from './ui.js';
import { CATEGORIAS, normalizar, gerarVariacoesAuto, variacoesArriscadas } from './texto.js';
import { entregar } from './exportar.js';

const $ = (s) => document.querySelector(s);

function separarVariacoes(texto) {
  const vistas = new Set();
  const lista = [];
  for (const v of String(texto || '').split(/[\n,;]+/)) {
    const t = v.trim();
    const k = normalizar(t);
    if (!t || !k || vistas.has(k)) continue;
    vistas.add(k);
    lista.push(t);
  }
  return lista;
}

function nomeCategoria(id) {
  return (CATEGORIAS.find((c) => c.id === id) || CATEGORIAS[3]).nome;
}

/** Confere se um objeto importado parece uma entrada válida. */
function limparEntrada(e) {
  if (!e || typeof e !== 'object') return null;
  const codigo = String(e.codigo ?? '').trim();
  const texto = String(e.texto ?? '').trim();
  if (!codigo || !texto) return null;
  const categoria = CATEGORIAS.some((c) => c.id === e.categoria) ? e.categoria : 'outro';
  const variacoes = Array.isArray(e.variacoes) ? separarVariacoes(e.variacoes.join('\n')) : separarVariacoes(e.variacoes);
  return { id: typeof e.id === 'string' && e.id ? e.id : db.novoId(), codigo, texto, categoria, variacoes, usos: Number(e.usos) || 0 };
}

export class TelaDicionario {
  constructor(ctx) {
    this.ctx = ctx;
    this.categoria = 'todas';
    $('#nova-entrada').innerHTML = icone('mais') + '<span class="uma-linha">Nova entrada</span>';
    $('#nova-entrada').addEventListener('click', () => this.editar(null));
    $('#dic-menu').innerHTML = icone('menu');
    $('#dic-menu').addEventListener('click', () => this.menuArquivo());
    $('#dic-busca').addEventListener('input', () => this.mostrar());
  }

  mostrar() {
    const todas = this.ctx.dicionario;
    // Filtros por categoria.
    const filtros = $('#dic-categorias');
    filtros.replaceChildren();
    const opcoes = [{ id: 'todas', nome: 'Todas' }, ...CATEGORIAS];
    for (const c of opcoes) {
      const qtd = c.id === 'todas' ? todas.length : todas.filter((e) => e.categoria === c.id).length;
      filtros.append(el('button', {
        class: 'filtro' + (this.categoria === c.id ? ' ativo' : ''),
        type: 'button', role: 'tab', 'aria-selected': String(this.categoria === c.id),
        onclick: () => { this.categoria = c.id; this.mostrar(); },
      }, c.id !== 'todas' ? el('span', { class: `ponto-cat cat-${c.id}` }) : null, `${c.nome} (${qtd})`));
    }

    const busca = normalizar($('#dic-busca').value);
    const lista = todas
      .filter((e) => this.categoria === 'todas' || e.categoria === this.categoria)
      .filter((e) => !busca || [e.texto, e.codigo, ...(e.variacoes || [])].some((x) => normalizar(x).includes(busca)))
      .sort((a, b) => a.texto.localeCompare(b.texto, 'pt-BR'));

    const ul = $('#lista-dicionario');
    ul.replaceChildren();
    $('#dicionario-vazio').hidden = todas.length > 0;
    for (const e of lista) {
      const vars = (e.variacoes || []).join(', ');
      ul.append(el('li', { class: 'cartao-item' },
        el('button', { class: 'abrir', type: 'button', onclick: () => this.editar(e) },
          el('span', { class: 'entrada-linha1' },
            el('span', { class: `ponto-cat cat-${e.categoria || 'outro'}` }),
            el('span', { class: 'cartao-titulo uma-linha' }, e.texto),
            el('span', { class: 'codigo' }, e.codigo)),
          el('span', { class: 'cartao-meta uma-linha' },
            nomeCategoria(e.categoria) + (vars ? ` · fala: ${vars}` : '')))));
    }
    if (todas.length && !lista.length) {
      ul.append(el('li', { class: 'vazio' }, 'Nada encontrado.'));
    }
  }

  // ---------- Formulário ----------

  async editar(entrada) {
    const nova = !entrada;
    const dados = entrada ? { ...entrada } : { id: db.novoId(), codigo: '', texto: '', categoria: 'personagem', variacoes: [], usos: 0 };

    const campoCodigo = el('input', { class: 'campo', id: 'f-codigo', type: 'text', value: dados.codigo, autocapitalize: 'characters', autocomplete: 'off', placeholder: 'Ex.: H, 2L, HL' });
    const campoTexto = el('input', { class: 'campo campo-texto-final', id: 'f-texto', type: 'text', value: dados.texto, autocomplete: 'off', placeholder: 'Ex.: Hán Lì 韩立' });
    const campoVar = el('textarea', { class: 'campo', id: 'f-var', rows: '3', autocapitalize: 'none', placeholder: 'Uma por linha. Ex.:\nagá\naga' });
    campoVar.value = (dados.variacoes || []).join('\n');
    const autoInfo = el('p', { class: 'ajuda' });
    const alertas = el('div', { class: 'campo-grupo' });

    const segmentos = el('div', { class: 'segmentos largo', role: 'radiogroup', 'aria-label': 'Categoria' });
    let categoria = dados.categoria || 'personagem';
    const desenharSegmentos = () => {
      segmentos.replaceChildren(...CATEGORIAS.map((c) => el('button', {
        type: 'button', class: categoria === c.id ? 'ativo' : '', role: 'radio', 'aria-checked': String(categoria === c.id),
        onclick: () => { categoria = c.id; desenharSegmentos(); },
      }, c.nome)));
    };
    desenharSegmentos();

    // Mostra variações automáticas e avisos enquanto digita.
    const atualizarAjuda = () => {
      const auto = gerarVariacoesAuto(campoCodigo.value).map((v) => v.exibir).filter((x) => normalizar(x) !== normalizar(campoCodigo.value));
      autoInfo.textContent = auto.length ? `O app também reconhece sozinho: ${auto.slice(0, 8).join(', ')}${auto.length > 8 ? '…' : ''}` : '';
      alertas.replaceChildren();
      const provisoria = { id: dados.id, codigo: campoCodigo.value, variacoes: separarVariacoes(campoVar.value) };
      const arriscadas = variacoesArriscadas(provisoria);
      if (arriscadas.length && !this.ctx.config.gatilhoAtivo) {
        alertas.append(el('p', { class: 'alerta' },
          `Atenção: “${arriscadas.join('”, “')}” é palavra comum. Com a palavra-gatilho desligada, ela será trocada pelo nome em todo lugar. Se isso atrapalhar, ligue o gatilho nas Configurações.`));
      }
      const meus = [provisoria.codigo, ...provisoria.variacoes].map(normalizar).filter(Boolean);
      for (const outra of this.ctx.dicionario) {
        if (outra.id === dados.id) continue;
        const delas = [outra.codigo, ...(outra.variacoes || [])].map(normalizar);
        const repetidas = meus.filter((k) => delas.includes(k));
        if (repetidas.length) {
          alertas.append(el('p', { class: 'alerta' }, `“${repetidas[0]}” já é usado por “${outra.texto}” (${outra.codigo}).`));
        }
      }
    };
    campoCodigo.addEventListener('input', atualizarAjuda);
    campoVar.addEventListener('input', atualizarAjuda);
    atualizarAjuda();

    const erro = el('p', { class: 'alerta', hidden: true });
    const conteudo = el('div', {},
      el('div', { class: 'campo-grupo' }, el('label', { for: 'f-texto' }, 'Texto final (como vai aparecer)'), campoTexto),
      el('div', { class: 'campo-grupo' }, el('label', { for: 'f-codigo' }, 'Código (o que você fala)'), campoCodigo, autoInfo),
      el('div', { class: 'campo-grupo' },
        el('label', { for: 'f-var' }, 'Variações faladas'),
        el('p', { class: 'ajuda' }, 'Como o reconhecimento de voz costuma escrever o código: “dois L”, “doisel”, “agá”…'),
        campoVar),
      el('div', { class: 'campo-grupo' }, el('label', {}, 'Categoria'), segmentos),
      alertas,
      erro,
      nova ? null : el('button', {
        class: 'botao secundario perigo-texto', type: 'button', style: 'width:100%;margin-top:6px',
        onclick: async () => {
          const ok = await confirmar('Excluir entrada?', `“${dados.texto}” sairá do dicionário. O texto das histórias não muda.`);
          if (!ok) return;
          await db.excluirEntrada(dados.id);
          await this.ctx.recarregarDicionario();
          conteudo.closest('.janela')._fechar(null);
          aviso('Entrada excluída');
          this.mostrar();
        },
      }, 'Excluir entrada'));

    const salvar = async () => {
      const codigo = campoCodigo.value.trim();
      const texto = campoTexto.value.trim();
      if (!texto || !codigo) {
        erro.textContent = 'Preencha o texto final e o código.';
        erro.hidden = false;
        return false;
      }
      const repetido = this.ctx.dicionario.find((o) => o.id !== dados.id && normalizar(o.codigo) === normalizar(codigo));
      if (repetido) {
        erro.textContent = `O código “${codigo}” já pertence a “${repetido.texto}”.`;
        erro.hidden = false;
        return false;
      }
      await db.salvarEntrada({ ...dados, codigo, texto, categoria, variacoes: separarVariacoes(campoVar.value) });
      await this.ctx.recarregarDicionario();
      aviso(nova ? 'Entrada criada' : 'Entrada salva');
      this.mostrar();
      return true;
    };

    if (nova) setTimeout(() => campoTexto.focus(), 80);
    await abrirJanela({
      titulo: nova ? 'Nova entrada' : 'Editar entrada',
      conteudo,
      botoes: [
        { texto: 'Cancelar', valor: null, classe: 'secundario' },
        { texto: 'Salvar', valor: 'ok', classe: 'principal', aoTocar: salvar },
      ],
    });
  }

  // ---------- Exportar / importar ----------

  async menuArquivo() {
    const escolha = await menu('Dicionário', [
      { texto: 'Exportar dicionário (JSON)', icone: 'baixar', valor: 'exportar' },
      { texto: 'Importar dicionário (JSON)', icone: 'enviar', valor: 'importar' },
    ]);
    if (escolha === 'exportar') this.exportar();
    if (escolha === 'importar') this.importar();
  }

  async exportar() {
    const dados = { app: 'ditado-historias', tipo: 'dicionario', versao: 1, criadoEm: Date.now(), entradas: this.ctx.dicionario };
    const data = new Date().toISOString().slice(0, 10);
    await entregar(`dicionario-${data}.json`, JSON.stringify(dados, null, 2), 'json', false);
  }

  async importar() {
    const texto = await escolherArquivo();
    if (!texto) return;
    let dados;
    try { dados = JSON.parse(texto); } catch { aviso('Arquivo inválido: não é um JSON.'); return; }
    const brutas = Array.isArray(dados) ? dados : (dados.entradas || dados.dicionario || []);
    const entradas = brutas.map(limparEntrada).filter(Boolean);
    if (!entradas.length) { aviso('Nenhuma entrada válida no arquivo.'); return; }

    const modo = await abrirJanela({
      titulo: 'Importar dicionário',
      conteudo: el('p', { class: 'texto-janela' },
        `${entradas.length} entradas encontradas. “Juntar” mantém as atuais e atualiza as que têm o mesmo código. “Substituir” apaga o dicionário atual.`),
      botoes: [
        { texto: 'Substituir', valor: 'substituir', classe: 'secundario' },
        { texto: 'Juntar', valor: 'juntar', classe: 'principal' },
      ],
    });
    if (!modo) return;
    if (modo === 'substituir') {
      const ok = await confirmar('Substituir tudo?', 'O dicionário atual será apagado e trocado pelo do arquivo.', 'Substituir');
      if (!ok) return;
      await db.substituirDicionario(entradas);
    } else {
      const porCodigo = new Map(this.ctx.dicionario.map((e) => [normalizar(e.codigo), e]));
      for (const e of entradas) {
        const atual = porCodigo.get(normalizar(e.codigo));
        await db.salvarEntrada(atual ? { ...e, id: atual.id, usos: atual.usos || 0 } : e);
      }
    }
    await this.ctx.recarregarDicionario();
    this.mostrar();
    aviso(`${entradas.length} entradas importadas`);
  }
}
