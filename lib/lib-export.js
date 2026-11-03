// lib-export.js
import { Readability } from '@mozilla/readability';
import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import rehypeRemark from 'rehype-remark';
import remarkStringify from 'remark-stringify';
import * as prettier from 'prettier/standalone';
import prettierMarkdown from 'prettier/plugins/markdown';
import remarkGfm from 'remark-gfm';

window.MyClipperLibs = {
  Readability,
  unified,
  rehypeParse,
  rehypeRemark,
  remarkStringify,
  remarkGfm,
  prettier,
  prettierMarkdown,
};