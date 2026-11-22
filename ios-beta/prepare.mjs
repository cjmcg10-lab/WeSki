// Adapt a clean checkout for a bundled beta. Only the temporary CI checkout is edited.
import { readFileSync, writeFileSync } from 'node:fs';
function replace(path, before, after) {
  const text = readFileSync(path, 'utf8');
  if (text.split(before).length !== 2) throw Error('Review iOS integration at ' + path + ': ' + before);
  writeFileSync(path, text.replace(before, () => after));
}
const main = 'src/main.js';
replace(main,"import { Locator } from './location.js';","import { PhoneLocator as Locator } from '../ios-beta/native.js';");
replace(main,'function renderChrome() {','function renderChrome() {\n  S.loc?.setBackground(Boolean(S.session || S.sharing || S.nav));');
replace(main,"function sheetPass(why) {","function sheetPass(why) {\n  return ['Free TestFlight beta', '<div class=\"card\"><p>All ski features are free during this beta.</p></div>'];");
replace(main,"Free during the preview · plans and prices","Free during the TestFlight beta");
replace(main,"const cache = await caches.open('weski-map');","// Native map requests are saved to IndexedDB as each file arrives.");
replace(main,'await cache.put(url, res);','// The bundled shell and local maps are already available offline.');
replace(main,"const list = (await (await fetch('/offline.json', { cache: 'no-store' })).json()).concat(","const list = [].concat(");
replace(main,"location.origin, S.group.code","'https://skiwithme.builtbyroger.app', S.group.code");
replace('src/group.js','new WebSocket(`${proto}://${location.host}/api/groups/${this.code}/ws`)','new WebSocket(`wss://skiwithme.builtbyroger.app/api/groups/${this.code}/ws`)');
replace('src/account.js','export const setSimFree = (on) => { simFree = !!on; };','export const setSimFree = () => { simFree = false; };');
replace('src/account.js',"cfg = await get('/api/config');","cfg = { paywall: false, signIn: false, paddle: null, plans: {} };");
replace('src/account.js','const c = config();',"throw new Error('Purchases are disabled in the free TestFlight beta.');");
replace(main,readFileSync(main,'utf8').split('\n').find(line => line.includes('id="f-simfree"')),'');
