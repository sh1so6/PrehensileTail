// NODE_PATH must include playwright. Pass the pinned upstream userscript as argv[2].
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    await page.route('https://x.com/**', route => route.fulfill({ body: '<html><body></body></html>', contentType: 'text/html' }));
    await page.goto('https://x.com/tester/status/123');
    const result = await page.evaluate(async ({ upstream, adapter }) => {
      const requests = [];
      window.GM_getValue = (key, fallback) => key === 'obsidian.vault' ? 'test-vault' : fallback;
      window.GM_setValue = () => {};
      window.GM_xmlhttpRequest = request => {
        const id = new URL(request.url).searchParams.get('id');
        requests.push(id);
        const quote = { id_str: '789', text: '取得した引用全文', user: {name: '引用元', screen_name: 'quoted'} };
        const data = id === '789' ? quote : id === '999'
          ? {id_str: '999', text: '取得した返信先本文', user: {name: '返信相手', screen_name: 'parent'}}
          : {id_str: id, text: '投稿本文', user: {name:'名前', screen_name:'tester'}, quoted_tweet: quote,
              in_reply_to_status_id_str: '999', in_reply_to_screen_name: 'parent'};
        request.onload({status: 200, responseText: JSON.stringify(data)});
      };
      // Use the real upstream API, with its DOM bootstrap disabled.
      const api = new Function('document', 'var module = {exports:{}};\n' + upstream + '\nreturn module.exports;')(undefined);
      const model = {
        type: 'post', author: { name: '名前|作者', handle: '@tester', avatarUrl: 'https://pbs.twimg.com/profile_images/1/avatar_400x400.jpg' },
        sourceUrl: location.href, publishedAt: '2026-09-12T01:00:00Z', exportedAt: '2026-09-12T02:00:00Z',
        blocks: [
          { kind: 'paragraph', html: '本名「引用」<br>次の行 &amp; <a href="https://example.com/a(b)">リンク</a>' },
          { kind: 'image', url: 'https://example.com/image.jpg', dataUri: 'data:image/jpeg;base64,IGNORE' },
          { kind: 'video', posterUrl: 'https://example.com/poster.jpg', mp4Url: 'https://example.com/video.mp4' },
          { kind: 'quote', sourceUrl: 'https://x.com/quoted/status/789', author: { name: '引用元', handle: '@quoted' }, blocks: [
            { kind: 'paragraph', html: '引用本文<br>2行目' },
            { kind: 'quote', author: {name:'再引用'}, blocks: [{kind:'paragraph',html:'さらに引用'}] },
          ] },
          { kind: 'image', url: 'data:image/png;base64,REJECT' },
          { kind: 'truncation-notice' },
        ],
      };
      if (typeof api.buildModelForPost !== 'function') throw Error('Missing upstream API');
      api.detectPageType = () => 'post';
      api.buildModelForPost = (target, options) => {
        if (target !== null || options.includeThread !== false) throw Error('Wrong extraction scope');
        return model;
      };
      let command, downloadCommand, saved, filename, sentUri;
      const delivery = [];
      const errors = [];
      URL.createObjectURL = blob => { saved = blob; return 'blob:test'; };
      window.GM_setClipboard = (text, type, done) => {
        if (type !== 'text') throw Error('Wrong clipboard format');
        saved = new Blob([text]);
        delivery.push('clipboard');
        setTimeout(done, 10);
      };
      HTMLAnchorElement.prototype.click = function () {
        if (this.protocol === 'obsidian:') {
          sentUri = this.href;
          const params = new URL(sentUri).searchParams;
          if (params.has('data')) {
            // Short notes travel inside the URI and must not touch the clipboard.
            saved = new Blob([params.get('data')]);
            delivery.push('data');
          } else {
            if (delivery.at(-1) !== 'clipboard') throw Error('URI before clipboard');
            delivery.push('uri');
          }
          filename = params.get('filepath');
        } else { filename = this.download; }
      };
      new Function('module', 'GM_registerMenuCommand', 'alert', adapter)(
        {exports: api}, (label, fn) => {
          if (label.includes('Obsidianへ送る')) command = fn;
          else if (label.includes('ダウンロード')) downloadCommand = fn;
        }, message => errors.push(message));
      await command();
      const markdown = await saved.text();
      history.replaceState({}, '', '/home');
      await command();
      const tick = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const post = document.createElement('article');
      post.dataset.testid = 'tweet';
      post.innerHTML = '<div><button data-testid="caret">More</button></div><div class="xa-ctl"><button>Original</button></div>';
      document.body.append(post);
      await tick();
      if (post.querySelectorAll('.scmd-save').length !== 1) throw Error('Missing per-post button');
      if (post.querySelector('.scmd-save').textContent !== '保存') throw Error('Wrong button label');
      if (getComputedStyle(post.querySelector('.xa-ctl')).display !== 'none') throw Error('Original UI visible');
      let originalClicked = false;
      post.querySelector('.xa-ctl button').onclick = () => { originalClicked = true; };
      post.querySelector('.xa-ctl button').click();
      if (originalClicked) throw Error('Original click not blocked');
      let captured = 0;
      api.timelineArticlePreviewReason = () => '';
      api.buildModelForPost = (target, options) => {
        if (target !== post || options.includeThread !== false) throw Error('Captured wrong post');
        captured++;
        return {...model, sourceUrl: 'https://x.com/other/status/456'};
      };
      post.querySelector('.scmd-save').click();
      for (let i = 0; i < 100 && post.querySelector('.scmd-save').disabled; i++) await tick();
      if (captured !== 1 || !filename.endsWith('.md') || /-456\.md$/.test(filename)) throw Error('Timeline save failed');
      if (post.querySelector('.scmd-save').textContent !== '✓ 完了') throw Error('Success label missing');
      const otherPost = document.createElement('article');
      otherPost.dataset.testid = 'tweet';
      document.body.append(otherPost);
      await tick();
      if (otherPost.querySelector('.scmd-save').textContent !== '保存') throw Error('Other post marked saved');
      post.append(document.createElement('span'));
      await tick();
      if (post.querySelectorAll('.scmd-save').length !== 1) throw Error('Duplicate button');
      post.querySelector('.scmd-save').remove();
      await tick();
      if (post.querySelectorAll('.scmd-save').length !== 1) throw Error('Button not restored');
      api.timelineArticlePreviewReason = () => 'Article preview';
      post.querySelector('.scmd-save').click();
      if (captured !== 1 || errors.length !== 2) throw Error('Preview guard failed');
      if (post.querySelector('.scmd-save').textContent !== '保存') throw Error('Failure marked saved');
      const successfulFilename = filename;
      history.replaceState({}, '', '/tester/status/123');
      api.buildModelForPost = () => model;
      // Failed API responses must preserve the DOM capture and leave an explicit notice.
      api.recoverMissingQuoteSourcesViaSyndication = async () => {};
      window.GM_xmlhttpRequest = request => request.onload({status: 200, responseText: '{}'});
      await command();
      const failureMarkdown = await saved.text();
      const sentBeforeDownload = delivery.length;
      await downloadCommand();
      if (delivery.length !== sentBeforeDownload || !filename.endsWith('.md')) throw Error('Download fallback failed');
      history.replaceState({}, '', '/i/article/123');
      api.detectPageType = () => 'article';
      let articleCaptured = 0;
      api.buildModelForArticle = () => {
        articleCaptured++;
        return {...model, type: 'article', heading: '記事タイトル', sourceUrl: location.href};
      };
      const articleRoot = document.createElement('div');
      articleRoot.dataset.testid = 'twitterArticleReadView';
      articleRoot.innerHTML = '<h1>記事タイトル</h1><p>記事本文</p>';
      document.body.append(articleRoot);
      await tick();
      const articleButton = articleRoot.querySelector('.scmd-save');
      if (!articleButton) throw Error('Article button missing');
      articleButton.click();
      for (let i = 0; i < 100 && articleButton.disabled; i++) await tick();
      if (articleCaptured !== 1 || articleButton.textContent !== '✓ 完了') throw Error('Article save failed');
      // Both old UTF-16 slice boundaries could split an emoji and break URI encoding.
      for (const [heading, body, expectedTitle] of [
        ['', 'a'.repeat(29) + '😀末尾', '名前「' + 'a'.repeat(29) + '😀」'],
        ['a'.repeat(99) + '😀末尾', '', 'a'.repeat(99) + '😀'],
        ['不正\uD800文字', '', '不正\uFFFD文字'],
      ]) {
        api.buildModelForArticle = () => ({...model, type: 'article', heading,
          author: {name: '名前', handle: '@tester'}, blocks: [{kind: 'paragraph', html: body}]});
        const errorsBefore = errors.length;
        await command();
        if (errors.length !== errorsBefore) throw Error('Unicode title failed: ' + errors.at(-1));
        const filepath = new URL(sentUri).searchParams.get('filepath');
        if (filepath !== `Clippings/x.com/${expectedTitle}.md`) throw Error('Unicode filename changed: ' + filepath);
      }
      // Long note: clipboard + clipboard=true URI, kept under Chromium's 2048-char external URL cap.
      api.buildModelForArticle = () => ({...model, type: 'article', heading: '長文',
        author: {name: '名前', handle: '@tester'}, blocks: [{kind: 'paragraph', html: 'あ'.repeat(1000)}]});
      const before = delivery.length;
      await command();
      if (delivery.slice(before).join() !== 'clipboard,uri') throw Error('Long note not sent via clipboard');
      if (!(await saved.text()).includes('あ'.repeat(1000))) throw Error('Long note body lost');
      const longUri = sentUri;
      if (longUri.length > 2000 || new URL(longUri).searchParams.get('clipboard') !== 'true') throw Error('Bad long URI');
      return {markdown, filename: successfulFilename, errors, requests, failureMarkdown, sentUri: longUri,
        modes: [...new Set(delivery)]};
    }, {upstream: fs.readFileSync(process.argv[2], 'utf8'), adapter: fs.readFileSync('sourcecapsule-md.user.js', 'utf8')});
    assert.match(result.markdown, /# Post\n> \[!Post\]/);
    assert.match(result.markdown, /> > \[!quote\]/);
    assert.match(result.markdown, /取得した引用全文/);
    assert.match(result.markdown, /\[!quote\] 返信先/);
    assert.match(result.markdown, /取得した返信先本文/);
    assert.ok(result.requests.includes('789') && result.requests.includes('999'));
    assert.match(result.failureMarkdown, /追加取得に失敗/);
    assert.match(result.failureMarkdown, /本名/);
    assert.match(result.markdown, /> 次の行 &amp; \[リンク\]\(<https:\/\/example.com\/a\(b\)>\)/);
    assert.match(result.markdown, /userID: "https:\/\/x.com\/tester"/);
    assert.match(result.markdown, /名前\\\|作者/);
    assert.match(result.markdown, /image\.jpg/);
    assert.match(result.markdown, /video\.mp4/);
    assert.match(result.markdown, /本文の一部が省略/);
    assert.match(result.markdown, /# Embed\n!\[\]\(<https:\/\/x.com\/tester\/status\/123>\)/);
    assert.doesNotMatch(result.markdown, /base64|feature:|thumbnail:|## Main Post/);
    const titleLine = result.markdown.split('\n').find(line => line.startsWith('title: '));
    assert.ok(JSON.parse(titleLine.slice(7)).includes('本名「引用」\n次の行'));
    assert.ok(result.filename.endsWith('.md'));
    assert.doesNotMatch(result.filename, /-(123|456)\.md$/);
    assert.match(result.markdown, /avatar_normal\.jpg/);
    assert.doesNotMatch(result.markdown, /avatar_400x400/);
    assert.equal(result.errors.length, 2);
    const uri = new URL(result.sentUri);
    assert.equal(uri.protocol, 'obsidian:');
    assert.equal(uri.hostname, 'adv-uri');
    assert.equal(uri.searchParams.get('vault'), 'test-vault');
    assert.ok(uri.searchParams.get('filepath').startsWith('Clippings/x.com/'));
    assert.equal(uri.searchParams.get('mode'), 'new');
    assert.equal(uri.searchParams.get('clipboard'), 'true');
    assert.ok(result.modes.includes('data') && result.modes.includes('uri'), 'Both delivery modes must be exercised');
    console.log('PASS: Advanced URI (data= / clipboard), clipboard before send, download fallback, enrichment and post buttons');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });


