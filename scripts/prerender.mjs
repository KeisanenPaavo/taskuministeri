// Esirenderöi sivun julkaisun yhteydessä: hakukoneet, tekoälyhaut ja linkkien esikatselut
// näkevät tekstit ja luvut ilman JavaScriptiä. Ajetaan `npm run build` -komennon lopuksi.
import { readFile, writeFile, rm } from "node:fs/promises";

const { render } = await import(new URL("../dist-ssr/entry-server.js", import.meta.url));
const data = JSON.parse(await readFile(new URL("../public/data/finance.json", import.meta.url), "utf8"));
const file = new URL("../dist/index.html", import.meta.url);
const html = await readFile(file, "utf8");

const app = render(data);
if (!html.includes('<div id="root"></div>')) throw new Error("dist/index.html: juurielementtiä ei löydy");
await writeFile(file, html.replace('<div id="root"></div>', `<div id="root">${app}</div>`));
await rm(new URL("../dist-ssr", import.meta.url), { recursive: true, force: true });

const text = app.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
console.log(`Esirenderöity: ${Math.round(app.length / 1024)} kt HTML:ää, ${text.split(" ").length} sanaa`);
