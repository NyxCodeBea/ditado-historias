// ============================================================
// db.js — Armazenamento local no celular (IndexedDB).
// Três "gavetas": historias, dicionario e config.
// ============================================================

const NOME_BANCO = 'ditado-historias';
const VERSAO = 1;

let conexao = null;

function abrir() {
  if (conexao) return conexao;
  conexao = new Promise((resolve, reject) => {
    const req = indexedDB.open(NOME_BANCO, VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('historias')) db.createObjectStore('historias', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('dicionario')) db.createObjectStore('dicionario', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('config')) db.createObjectStore('config', { keyPath: 'chave' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return conexao;
}

function promessa(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function gaveta(nome, modo = 'readonly') {
  const db = await abrir();
  return db.transaction(nome, modo).objectStore(nome);
}

export function novoId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ---------- Histórias ----------

export async function listarHistorias() {
  const lista = await promessa((await gaveta('historias')).getAll());
  return lista.sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0));
}

export async function obterHistoria(id) {
  return promessa((await gaveta('historias')).get(id));
}

export async function salvarHistoria(h) {
  return promessa((await gaveta('historias', 'readwrite')).put(h));
}

export async function excluirHistoria(id) {
  return promessa((await gaveta('historias', 'readwrite')).delete(id));
}

// ---------- Dicionário ----------

export async function listarDicionario() {
  return promessa((await gaveta('dicionario')).getAll());
}

export async function salvarEntrada(e) {
  return promessa((await gaveta('dicionario', 'readwrite')).put(e));
}

export async function excluirEntrada(id) {
  return promessa((await gaveta('dicionario', 'readwrite')).delete(id));
}

export async function substituirDicionario(entradas) {
  const db = await abrir();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dicionario', 'readwrite');
    const g = tx.objectStore('dicionario');
    g.clear();
    for (const e of entradas) g.put(e);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- Configurações ----------

export const CONFIG_PADRAO = {
  tema: 'auto',             // 'auto' | 'claro' | 'escuro'
  tamanhoTexto: 19,         // em px
  gatilhoAtivo: false,      // começa DESLIGADO
  palavraGatilho: 'código',
  comandosFalados: true,
  maiusculaAuto: true,
  pontuacaoAuto: true,      // vírgula e ponto pelas pausas — começa LIGADA
  pausaCurta: 700,          // ms de silêncio para vírgula
  pausaLonga: 1600,         // ms de silêncio para ponto final
  modoTeclado: true,        // ajusta o texto digitado/ditado pelo teclado do celular
  ultimoBackup: 0,
  lembreteBackupEm: 0,
};

export async function lerConfig() {
  const lista = await promessa((await gaveta('config')).getAll());
  const cfg = { ...CONFIG_PADRAO };
  for (const item of lista) cfg[item.chave] = item.valor;
  return cfg;
}

export async function gravarConfig(chave, valor) {
  return promessa((await gaveta('config', 'readwrite')).put({ chave, valor }));
}

// ---------- Backup completo ----------

export async function exportarTudo() {
  const [historias, dicionario, config] = await Promise.all([
    listarHistorias(), listarDicionario(), lerConfig(),
  ]);
  return { app: 'ditado-historias', tipo: 'backup', versao: 1, criadoEm: Date.now(), historias, dicionario, config };
}

export async function importarTudo(dados) {
  const db = await abrir();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['historias', 'dicionario', 'config'], 'readwrite');
    for (const h of dados.historias || []) tx.objectStore('historias').put(h);
    for (const e of dados.dicionario || []) tx.objectStore('dicionario').put(e);
    for (const [chave, valor] of Object.entries(dados.config || {})) {
      if (chave in CONFIG_PADRAO) tx.objectStore('config').put({ chave, valor });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Pede ao navegador para não apagar os dados quando faltar espaço. */
export async function pedirArmazenamentoPersistente() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch { /* sem suporte */ }
  return false;
}
