# Ditado de Histórias

App pessoal (PWA) para escrever histórias ditando, com um dicionário de nomes e termos do mundo da história.
HTML, CSS e JavaScript puros, sem servidor. Tudo fica salvo no próprio celular (IndexedDB).

## Estrutura

```
index.html            telas (histórias, editor, dicionário, configurações)
manifest.webmanifest  dados de instalação
sw.js                 modo offline (ao publicar mudanças, aumente VERSAO aqui)
css/estilo.css        visual claro/escuro
js/app.js             início e navegação
js/db.js              armazenamento local
js/voz.js             reconhecimento de voz pt-BR
js/texto.js           códigos, pontuação falada e automática (pausas), modo teclado, maiúsculas e espaçamento
js/editor.js          tela do editor
js/historias.js       lista de histórias
js/dicionario.js      Dicionário do Mundo
js/ajustes.js         configurações e backup
js/exportar.js        .txt e .docx
icons/                ícones
testes/               testes da lógica de texto (node testes/testes.js ou abrir testes/testes.html)
```

## Testar no computador

```
python -m http.server 8000
```
Abrir http://localhost:8000 no Chrome.
