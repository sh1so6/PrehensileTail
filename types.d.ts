export interface Schema {
  title: string;
  source: string;
  author: string[];
  published: string;
  created: string;
  description: string;
  tags: string[];
}

export interface Setting {
  name: string;
  path: string;
}
