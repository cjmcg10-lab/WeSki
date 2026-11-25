// Adapt a clean checkout for a bundled beta. Only the temporary CI checkout is edited.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
function replace(path, before, after) {
  const text = readFileSync(path, 'utf8');
  if (text.split(before).length !== 2) throw Error('Review iOS integration at ' + path + ': ' + before);
  writeFileSync(path, text.replace(before, () => after));
}
const main = 'src/main.js';
replace(main,"import { Locator } from './location.js';","import { PhoneLocator as Locator } from '../ios-beta/native.js';");
replace(main,'function renderChrome() {','function renderChrome() {\n  S.loc?.setBackground(Boolean(S.session || S.sharing || S.nav));');
replace(main,"const store = await caches.open(MAP_CACHE);","// Native map requests are saved to IndexedDB as each file arrives.");
replace(main,'await store.put(at, res);','// The bundled shell and local maps are already available offline.');
replace(main,"const app = await (await fetch('/offline.json', { cache: 'no-store' })).json();","const app = [];");
replace(main,"location.origin, S.group.code","'https://skiwithme.builtbyroger.app', S.group.code");
replace('src/group.js','new WebSocket(`${proto}://${location.host}/api/groups/${this.code}/ws`)','new WebSocket(`wss://skiwithme.builtbyroger.app/api/groups/${this.code}/ws`)');
replace('src/account.js','export const setSimFree = (on) => { simFree = !!on; };','export const setSimFree = () => { simFree = false; };');
// Inside the iPhone app passes are bought through Apple only (ios-beta/native.js): Paddle's checkout must never open.
replace('src/account.js','const c = config();',"throw new Error('Passes are bought through the App Store in the iPhone app.');");
const mainLines = readFileSync(main, 'utf8').split('\n');
const simLine = mainLines.findIndex(line => line.includes('id="f-simfree"'));
if (simLine < 1 || !mainLines[simLine + 1].includes("L('simfree'")) throw Error('Review iOS integration at ' + main + ': f-simfree');
replace(main, mainLines.slice(simLine - 1, simLine + 2).join('\n'), '    </div>');
replace(main, "v.querySelector('iframe').src = href;", "v.querySelector('iframe').src = href.replace(/^(\\/(?:legal\\/[a-z]+|about))(?=$|#)/, '$1.html');");
const withHtml = text => text.replace(/href="(\/legal\/[a-z]+|\/about)(#[^"]*)?"/g, 'href="$1.html$2"');
for (const file of [...readdirSync('public/legal').filter(name => name.endsWith('.html')).map(name => 'public/legal/' + name), 'public/about.html']) {
  writeFileSync(file, withHtml(readFileSync(file, 'utf8')));
}
