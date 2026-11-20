// ============================================================
// ui.js — Peças de interface reutilizáveis: ícones, janelas
// (modais), menus e avisos rápidos.
// ============================================================

// Ícones em SVG (traço), herdam a cor do texto.
const caminhos = {
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/><path d="M8.5 21h7"/>',
  pausa: '<rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/>',
  desfazer: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  voltar: '<path d="M15 18l-6-6 6-6"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  menu: '<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>',
  busca: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  fechar: '<path d="M6 6l12 12M18 6 6 18"/>',
  livro: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/><path d="M8 7h7"/>',
  dicionario: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/><path d="M10 8h5"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  lixeira: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  baixar: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
  enviar: '<path d="M12 15V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/>',
  compartilhar: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>',
  enter: '<path d="M20 5v6a3 3 0 0 1-3 3H5"/><path d="m9 10-4 4 4 4"/>',
  copiar: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  revisar: '<path d="M4 6h10M4 11h7M4 16h5"/><path d="m13 17 3 3 5-6"/>',
};

export function icone(nome, tamanho = 24) {
  return `<svg class="icone" width="${tamanho}" height="${tamanho}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${caminhos[nome] || ''}</svg>`;
}

/** Cria um elemento: el('button', { class: 'x', onclick }, 'texto', filho...) */
export function el(tag, atributos = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(atributos || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'class') e.className = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat()) {
    if (f === null || f === undefined || f === false) continue;
    e.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return e;
}

// ---------- Aviso rápido ----------

let temporizadorAviso = null;
export function aviso(mensagem, duracao = 2600) {
  const t = document.getElementById('aviso');
  t.textContent = mensagem;
  t.classList.add('visivel');
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => t.classList.remove('visivel'), duracao);
}

// ---------- Janela (modal) ----------

/**
 * Abre uma janela. Resolve com o "valor" do botão tocado
 * (ou null se fechar tocando fora).
 * botoes: [{ texto, valor, classe, aoTocar }] — se aoTocar devolver false, não fecha.
 */
export function abrirJanela({ titulo, conteudo, botoes = [], estilo = 'janela' }) {
  return new Promise((resolve) => {
    const raiz = document.getElementById('camada-janelas');
    const fundo = el('div', { class: 'fundo-janela' });
    const caixa = el('div', { class: estilo, role: 'dialog', 'aria-modal': 'true' });
    if (titulo) caixa.append(el('h2', { class: 'titulo-janela uma-linha' }, titulo));
    if (conteudo) caixa.append(conteudo);

    let fechada = false;
    const fechar = (valor) => {
      if (fechada) return;
      fechada = true;
      fundo.classList.remove('aberta');
      setTimeout(() => fundo.remove(), 180);
      document.removeEventListener('keydown', teclas);
      resolve(valor);
    };
    const teclas = (e) => { if (e.key === 'Escape') fechar(null); };

    if (botoes.length) {
      const linha = el('div', { class: 'botoes-janela' });
      for (const b of botoes) {
        linha.append(el('button', {
          class: 'botao ' + (b.classe || ''),
          type: 'button',
          onclick: async () => {
            if (b.aoTocar) {
              const r = await b.aoTocar();
              if (r === false) return;
            }
            fechar(b.valor);
          },
        }, b.texto));
      }
      caixa.append(linha);
    }

    fundo.addEventListener('click', (e) => { if (e.target === fundo) fechar(null); });
    document.addEventListener('keydown', teclas);
    fundo.append(caixa);
    raiz.append(fundo);
    caixa._fechar = fechar;
    requestAnimationFrame(() => fundo.classList.add('aberta'));
  });
}

export async function confirmar(titulo, mensagem, textoOk = 'Excluir', perigo = true) {
  const r = await abrirJanela({
    titulo,
    conteudo: el('p', { class: 'texto-janela' }, mensagem),
    botoes: [
      { texto: 'Cancelar', valor: false, classe: 'secundario' },
      { texto: textoOk, valor: true, classe: perigo ? 'perigo' : 'principal' },
    ],
  });
  return r === true;
}

export async function pedirTexto(titulo, valorInicial = '', dica = '') {
  const campo = el('input', { class: 'campo', type: 'text', value: valorInicial, placeholder: dica, enterkeyhint: 'done' });
  const conteudo = el('div', {}, campo);
  let valor = null;
  const promessa = abrirJanela({
    titulo,
    conteudo,
    botoes: [
      { texto: 'Cancelar', valor: null, classe: 'secundario' },
      { texto: 'Salvar', valor: 'ok', classe: 'principal', aoTocar: () => { valor = campo.value.trim(); } },
    ],
  });
  campo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      valor = campo.value.trim();
      conteudo.closest('.janela')._fechar('ok');
    }
  });
  setTimeout(() => { campo.focus(); campo.select(); }, 60);
  const r = await promessa;
  return r === 'ok' ? valor : null;
}

/** Menu de opções que sobe de baixo da tela. */
export function menu(titulo, opcoes) {
  return new Promise((resolve) => {
    const lista = el('div', { class: 'lista-menu' });
    let caixa;
    for (const o of opcoes) {
      if (o.oculta) continue;
      lista.append(el('button', {
        class: 'item-menu' + (o.perigo ? ' perigo-texto' : ''),
        type: 'button',
        disabled: o.desativada || null,
        onclick: () => caixa._fechar(o.valor),
      }, el('span', { html: icone(o.icone || 'mais', 22) }), el('span', { class: 'uma-linha' }, o.texto)));
    }
    abrirJanela({ titulo, conteudo: lista, estilo: 'folha' }).then(resolve);
    caixa = lista.closest('.folha');
  });
}

/** Escolher um arquivo do celular. Resolve com o texto do arquivo. */
export function escolherArquivo(aceita = '.json,application/json') {
  return new Promise((resolve) => {
    const input = el('input', { type: 'file', accept: aceita, style: 'display:none' });
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      input.remove();
      resolve(f ? await f.text() : null);
    });
    document.body.append(input);
    input.click();
  });
}

export function formatarData(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const agora = new Date();
  const mesmoDia = d.toDateString() === agora.toDateString();
  if (mesmoDia) return 'hoje, ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const ontem = new Date(agora); ontem.setDate(agora.getDate() - 1);
  if (d.toDateString() === ontem.toDateString()) return 'ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: d.getFullYear() === agora.getFullYear() ? undefined : 'numeric' });
}

export function formatarNumero(n) {
  return Number(n || 0).toLocaleString('pt-BR');
}
