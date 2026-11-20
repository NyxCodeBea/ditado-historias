// ============================================================
// voz.js — Reconhecimento de voz (Web Speech API) em pt-BR.
// Modo contínuo com resultados parciais. Quando o navegador
// encerra a escuta sozinho (silêncio, limite de tempo), religa.
// ============================================================

const Reconhecedor = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

const ANDROID = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

const MENSAGENS_ERRO = {
  'not-allowed': 'O microfone foi bloqueado. Libere o microfone para este site nas configurações do navegador.',
  'service-not-allowed': 'O reconhecimento de voz não está liberado neste navegador.',
  'audio-capture': 'Nenhum microfone encontrado.',
  'network': 'Sem conexão: o reconhecimento de voz precisa de internet.',
  'language-not-supported': 'O português do Brasil não está disponível no reconhecimento de voz.',
};

export class Ditado {
  /**
   * callbacks:
   *  aoParcial(texto)  — texto provisório (enquanto fala)
   *  aoFinal(texto)    — trecho confirmado
   *  aoFimSessao()     — o navegador encerrou uma sessão de escuta
   *  aoEstado(estado)  — 'ouvindo' | 'iniciando' | 'parado'
   *  aoErro(mensagem)
   */
  constructor(callbacks) {
    this.cb = callbacks;
    this.querOuvir = false;
    this.rec = null;
    this.reinicios = [];
  }

  static suportado() {
    return !!Reconhecedor;
  }

  get ligado() {
    return this.querOuvir;
  }

  iniciar() {
    if (!Reconhecedor) {
      this.cb.aoErro?.('Este navegador não tem reconhecimento de voz. Use o Chrome (Android) ou o Safari (iPhone).');
      return;
    }
    this.querOuvir = true;
    this.cb.aoEstado?.('iniciando');
    if (!this.rec) this._abrirSessao();
  }

  parar() {
    this.querOuvir = false;
    if (this.rec) {
      try { this.rec.stop(); } catch { /* já parado */ }
    } else {
      this.cb.aoEstado?.('parado');
    }
  }

  /**
   * Descarta o que está sendo reconhecido agora (porque já foi
   * confirmado à mão) e volta a ouvir logo em seguida.
   */
  descartarEReiniciar() {
    if (!this.rec) return;
    this.rec._ignorar = true;
    try { this.rec.abort(); } catch { /* ignora */ }
  }

  _abrirSessao() {
    const rec = new Reconhecedor();
    rec.lang = 'pt-BR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec._ignorar = false;
    this.rec = rec;

    let processados = 0;      // quantos resultados finais já foram usados
    let ultimoFinal = '';     // para corrigir repetições do Chrome Android

    // No Android, o Chrome às vezes repete o trecho anterior no início do novo.
    const semRepeticao = (t) => {
      if (ANDROID && ultimoFinal) {
        const a = t.trimStart().toLowerCase();
        const b = ultimoFinal.trim().toLowerCase();
        if (b && a.startsWith(b)) return t.trimStart().slice(b.length);
      }
      return t;
    };

    rec.onstart = () => {
      if (this.rec === rec) this.cb.aoEstado?.('ouvindo');
    };

    rec.onresult = (ev) => {
      if (rec._ignorar || this.rec !== rec) return;
      let parcial = '';
      let viuParcial = false;
      for (let i = processados; i < ev.results.length; i++) {
        const r = ev.results[i];
        const t = r[0] ? r[0].transcript : '';
        if (r.isFinal && !viuParcial) {
          processados = i + 1;
          const novo = semRepeticao(t);
          ultimoFinal = t;
          if (novo.trim()) this.cb.aoFinal?.(novo);
        } else {
          viuParcial = true;
          parcial += t;
        }
      }
      this.cb.aoParcial?.(semRepeticao(parcial));
    };

    rec.onerror = (ev) => {
      const msg = MENSAGENS_ERRO[ev.error];
      if (msg) {
        this.querOuvir = false;
        this.cb.aoErro?.(msg);
      }
      // 'no-speech' e 'aborted' são normais: a escuta religa sozinha.
    };

    rec.onend = () => {
      if (this.rec !== rec) return;
      this.rec = null;
      if (!rec._ignorar) this.cb.aoFimSessao?.();
      if (this.querOuvir) {
        // Evita religar sem parar se algo estiver errado.
        const agora = Date.now();
        this.reinicios = this.reinicios.filter((t) => agora - t < 10000);
        this.reinicios.push(agora);
        const espera = this.reinicios.length > 6 ? 1500 : 0;
        setTimeout(() => { if (this.querOuvir && !this.rec) this._abrirSessao(); }, espera);
      } else {
        this.cb.aoEstado?.('parado');
      }
    };

    try {
      rec.start();
    } catch (e) {
      this.rec = null;
      this.querOuvir = false;
      this.cb.aoEstado?.('parado');
      this.cb.aoErro?.('Não foi possível ligar o microfone: ' + (e.message || e));
    }
  }
}
