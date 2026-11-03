// entrypoint が組み立てる標準値に、ハンドラが返す siteSchema / siteSetting を上書きマージする。
// ハンドラが返すのは一部だけなので、各フィールドは省略可能。
export interface Schema {
  title?: string;
  source?: string;
  author?: string | string[];
  published?: string;
  created?: string;
  description?: string;
  tags?: string[];
  // サイト固有 (gemini.google.com)
  id?: string;
  // サイト固有 (X の投稿など)
  url?: string;
  userID?: string;
  profile?: string;
}

export interface Setting {
  name?: string;
  path?: string;
}
