// ============================================================
// exportar.js — Exporta histórias em .txt e .docx.
// O .docx é montado aqui mesmo (um arquivo ZIP com XML dentro),
// sem bibliotecas externas, então funciona offline.
// ============================================================

// ---------- ZIP (sem compressão) ----------

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dataDos(d = new Date()) {
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const dia = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { hora, dia };
}

/** Cria um ZIP. arquivos: [{ nome, dados: Uint8Array }] → Uint8Array */
export function criarZip(arquivos) {
  const enc = new TextEncoder();
  const { hora, dia } = dataDos();
  const partes = [];
  const central = [];
  let deslocamento = 0;

  for (const a of arquivos) {
    const nome = enc.encode(a.nome);
    const crc = crc32(a.dados);
    const tam = a.dados.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nomes em UTF-8
    local.setUint16(8, 0, true); // sem compressão
    local.setUint16(10, hora, true);
    local.setUint16(12, dia, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, tam, true);
    local.setUint32(22, tam, true);
    local.setUint16(26, nome.length, true);
    local.setUint16(28, 0, true);
    partes.push(new Uint8Array(local.buffer), nome, a.dados);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, hora, true);
    c.setUint16(14, dia, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, tam, true);
    c.setUint32(24, tam, true);
    c.setUint16(28, nome.length, true);
    c.setUint32(42, deslocamento, true);
    central.push(new Uint8Array(c.buffer), nome);

    deslocamento += 30 + nome.length + tam;
  }

  const tamCentral = central.reduce((s, p) => s + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamCentral, true);
  fim.setUint32(16, deslocamento, true);

  const todas = [...partes, ...central, new Uint8Array(fim.buffer)];
  const total = todas.reduce((s, p) => s + p.length, 0);
  const saida = new Uint8Array(total);
  let pos = 0;
  for (const p of todas) { saida.set(p, pos); pos += p.length; }
  return saida;
}

// ---------- DOCX ----------

function xml(s) {
  return String(s)
    // Remove caracteres de controle que o Word não aceita.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function paragrafo(texto, estilo) {
  const pPr = estilo ? `<w:pPr><w:pStyle w:val="${estilo}"/></w:pPr>` : '';
  if (!texto) return `<w:p>${pPr}</w:p>`;
  const partes = texto.split('\t').map((t) => `<w:t xml:space="preserve">${xml(t)}</w:t>`);
  return `<w:p>${pPr}<w:r>${partes.join('<w:tab/>')}</w:r></w:p>`;
}

/** Gera os bytes de um .docx com título e texto (um parágrafo por linha). */
export function gerarDocx(titulo, texto) {
  const enc = new TextEncoder();
  const corpo = [
    paragrafo(titulo, 'Titulo'),
    ...String(texto || '').split('\n').map((l) => paragrafo(l)),
  ].join('');

  const tipos = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

  const relsDoc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

  const estilos = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:eastAsia="SimSun" w:cs="Georgia"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="pt-BR" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Titulo"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="360"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style></w:styles>`;

  const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${corpo}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  return criarZip([
    { nome: '[Content_Types].xml', dados: enc.encode(tipos) },
    { nome: '_rels/.rels', dados: enc.encode(rels) },
    { nome: 'word/_rels/document.xml.rels', dados: enc.encode(relsDoc) },
    { nome: 'word/styles.xml', dados: enc.encode(estilos) },
    { nome: 'word/document.xml', dados: enc.encode(documento) },
  ]);
}

// ---------- Entrega do arquivo (baixar ou compartilhar) ----------

export function nomeDeArquivo(titulo, extensao) {
  const base = String(titulo || 'historia')
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'historia';
  return `${base}.${extensao}`;
}

const TIPOS = {
  txt: 'text/plain;charset=utf-8',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  json: 'application/json',
};

export function podeCompartilharArquivos() {
  try {
    const f = new File(['x'], 'x.txt', { type: 'text/plain' });
    return !!(navigator.canShare && navigator.canShare({ files: [f] }));
  } catch { return false; }
}

/** Baixa o arquivo ou abre o menu de compartilhar do celular. */
export async function entregar(nome, conteudo, extensao, compartilhar = false) {
  const blob = new Blob([conteudo], { type: TIPOS[extensao] || 'application/octet-stream' });
  if (compartilhar) {
    const arquivo = new File([blob], nome, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      try {
        await navigator.share({ files: [arquivo], title: nome });
        return true;
      } catch (e) {
        if (e && e.name === 'AbortError') return false; // a pessoa cancelou
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return true;
}

export function exportarTxt(historia, compartilhar) {
  // Usa CRLF para abrir bem também no Bloco de Notas do Windows.
  const conteudo = `${historia.titulo}\r\n\r\n${String(historia.texto || '').replace(/\r?\n/g, '\r\n')}\r\n`;
  return entregar(nomeDeArquivo(historia.titulo, 'txt'), '﻿' + conteudo, 'txt', compartilhar);
}

export function exportarDocx(historia, compartilhar) {
  return entregar(nomeDeArquivo(historia.titulo, 'docx'), gerarDocx(historia.titulo, historia.texto), 'docx', compartilhar);
}
