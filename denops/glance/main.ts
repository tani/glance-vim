import { Denops } from "https://lib.deno.dev/x/denops_std@v2/mod.ts";
import { execute } from "https://lib.deno.dev/x/denops_std@v2/helper/mod.ts";
import * as vars from "https://lib.deno.dev/x/denops_std@v2/variable/mod.ts";
import * as funs from "https://lib.deno.dev/x/denops_std@v2/function/mod.ts";
import { join } from "https://deno.land/std/path/mod.ts";
import { Server } from "./server.ts";
import { MarkdownRenderer } from "./markdown.ts";

const defaultStylesheet = `
#root {
  margin: 50px auto;
  width: min(700px, 90%);
}
`;

export async function main(denops: Denops) {
  async function readFile(path: string) {
    const dir = await funs.expand(denops, "%:p:h") as string;
    return Deno.readFile(join(dir, path));
  }

  async function update() {
    const lines = await funs.getline(denops, 1, "$");
    const content = lines.join("\n");
    const document = await renderer.render(content);
    const pos = await funs.getpos(denops, ".");
    server.send("update", { document, line: pos[1] });
  }
  const port = (await vars.g.get(denops, "glance#server_port", 8765))!;
  const plugins = (await vars.g.get(denops, "glance#markdown_plugins", []))!;
  const html = (await vars.g.get(denops, "glance#markdown_html", false))!;
  const breaks = (await vars.g.get(denops, "glance#markdown_breaks", false))!;
  const linkify = (await vars.g.get(denops, "glance#markdown_linkify", false))!;
  const stylesheet = (await vars.g.get(denops, "glance#stylesheet", defaultStylesheet))!;
  const defaultConfigPath = new URL("./config.ts", import.meta.url).toString();
  const configPath = (await vars.g.get<string>(denops, "glance#config", defaultConfigPath))!;
  const { createMarkdownRenderer } = await import(configPath);
  const renderer = new MarkdownRenderer();
  await renderer.initialize({ html, breaks, linkify, plugins, createMarkdownRenderer });
  const server = new Server({ onOpen: update, readFile, stylesheet });

  denops.dispatcher = {
    update() {
      update();
      return Promise.resolve();
    },
    listen() {
      server.listen({ port });
      return Promise.resolve();
    },
    close() {
      server.close();
      return Promise.resolve();
    },
  };
  const script = `
    function s:glance()
      call denops#notify('${denops.name}', 'listen', [])
      augroup Grance
        autocmd!
        autocmd TextChanged,TextChangedI,TextChangedP <buffer> call denops#notify('${denops.name}', 'update', [])
        autocmd CursorMoved,CursorMovedI <buffer> call denops#notify('${denops.name}', 'update', [])
        autocmd BufUnload <buffer> call denops#notify('${denops.name}', 'close', [])
      augroup END
    endfunction
    command! Glance call s:glance()
  `;
  execute(denops, script);
}