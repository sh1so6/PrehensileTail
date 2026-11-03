// ==UserScript==
// @name        WebClipper
// @match       *://*/*
// @exclude     *://www.youtube.com/*
// @exclude     *://x.com/*
// @exclude     *://nola-novel.com/*
// @grant       GM_registerMenuCommand
// @grant       GM_xmlhttpRequest
// @grant       GM_getValue
// @grant       GM_setValue
// @connect     127.0.0.1
// @version     2.2.0
// @updateURL   http://127.0.0.1:18080/loader.user.js
// @downloadURL http://127.0.0.1:18080/loader.user.js
// --- Library ---
// @require     https://cdnjs.cloudflare.com/ajax/libs/js-yaml/4.1.0/js-yaml.min.js
// @require     https://unpkg.com/mustache@4.2.0/mustache.js
// @require     http://127.0.0.1:18080/lib/bundle.js
// @require     http://127.0.0.1:18080/_.js
// @require     http://127.0.0.1:18080/default.js
// @require     http://127.0.0.1:18080/x.com.js
// @require     http://127.0.0.1:18080/gemini.google.com.js
// @require     http://127.0.0.1:18080/lib/mdrop-client.js
// --- EntryPoint ---
// @require     http://127.0.0.1:18080/entrypoint.js
// ==/UserScript==
// 拡張機能のブラウザ設定からファイルURIへのアクセスを許可すること。
