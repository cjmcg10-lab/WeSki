// What a place's name means, in the reader's language: shown in brackets under the real name
// ("Talstation Furi" -> "Bottom station Furi" for an English reader). Place names are names, so
// only the common words in them are translated (hut, top station, lake, ski school, chairlift...)
// and the proper name is left alone. Nothing is shown when nothing in the name needs it.
import { getLang } from './i18n.js';

const L = ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ja', 'ko', 'zh'];
// Word order: these languages put the kind of place first ("Refuge Gandegg"), the others last.
const HEAD_FIRST = new Set(['es', 'fr', 'it', 'pt']);
const CJK = new Set(['ja', 'ko', 'zh']);

// concept: [words it is written as (any language, lower case, accents optional), translations in L order]
const C = {
  hut: [['hut', 'hütte', 'huette', 'hüttn', 'refuge', 'cabane', 'rifugio', 'capanna', 'baita', 'cabin'],
    ['Hut', 'Refugio', 'Refuge', 'Hütte', 'Rifugio', 'Refúgio', 'Hut', '山小屋', '산장', '山屋']],
  alm: [['alm', 'alp', 'alpe', 'alpage', 'alpeggio'],
    ['Alpine farm', 'Granja alpina', 'Alpage', 'Alm', 'Alpeggio', 'Quinta alpina', 'Alm', '山の牧場', '고산 목장', '高山牧场']],
  restaurant: [['restaurant', 'ristorante', 'restaurante', 'trattoria', 'osteria', 'brasserie', 'bergrestaurant', 'レストラン'],
    ['Restaurant', 'Restaurante', 'Restaurant', 'Restaurant', 'Ristorante', 'Restaurante', 'Restaurant', 'レストラン', '레스토랑', '餐厅']],
  inn: [['inn', 'gasthaus', 'gasthof', 'wirtshaus', 'auberge', 'locanda', 'stube', 'stubn', 'stüberl', 'stübli', 'beisl'],
    ['Inn', 'Posada', 'Auberge', 'Gasthaus', 'Locanda', 'Pousada', 'Herberg', '食事処', '주막', '客栈']],
  guesthouse: [['pension', 'pensione', 'guesthouse', 'gästehaus'],
    ['Guesthouse', 'Pensión', 'Pension', 'Pension', 'Pensione', 'Pensão', 'Pension', '民宿', '민박', '民宿']],
  hotel: [['hotel', 'hôtel', 'albergo'],
    ['Hotel', 'Hotel', 'Hôtel', 'Hotel', 'Hotel', 'Hotel', 'Hotel', 'ホテル', '호텔', '酒店']],
  mtnhotel: [['berghotel'],
    ['Mountain hotel', 'Hotel de montaña', 'Hôtel de montagne', 'Berghotel', 'Hotel di montagna', 'Hotel de montanha', 'Berghotel', '山岳ホテル', '산악 호텔', '山地酒店']],
  mtnhouse: [['berghaus'],
    ['Mountain inn', 'Casa de montaña', 'Maison de montagne', 'Berghaus', 'Casa di montagna', 'Casa de montanha', 'Berghuis', '山の家', '산장', '山间小屋']],
  cafe: [['café', 'cafe', 'caffè', 'caffe', 'kaffee', 'cafeteria', 'cafétéria'],
    ['Café', 'Cafetería', 'Café', 'Café', 'Caffè', 'Café', 'Café', 'カフェ', '카페', '咖啡馆']],
  bar: [['bar', 'pub', 'bistro'],
    ['Bar', 'Bar', 'Bar', 'Bar', 'Bar', 'Bar', 'Bar', 'バー', '바', '酒吧']],
  lodge: [['lodge', 'lodges'],
    ['Lodge', 'Albergue', 'Chalet', 'Hütte', 'Rifugio', 'Abrigo', 'Lodge', 'ロッジ', '롯지', '山屋']],
  topstation: [['bergstation', 'stazione a monte', 'gare d\'arrivée', 'top station', 'summit station', 'stazione di monte'],
    ['Top station', 'Estación superior', 'Gare d\'arrivée', 'Bergstation', 'Stazione a monte', 'Estação superior', 'Bergstation', '山頂駅', '상부 정류장', '上站']],
  bottomstation: [['talstation', 'stazione a valle', 'gare de départ', 'bottom station', 'base station', 'valley station', 'stazione di valle'],
    ['Bottom station', 'Estación inferior', 'Gare de départ', 'Talstation', 'Stazione a valle', 'Estação inferior', 'Dalstation', '山麓駅', '하부 정류장', '下站']],
  midstation: [['mittelstation', 'stazione intermedia', 'gare intermédiaire', 'mid station', 'middle station', 'mid-station'],
    ['Middle station', 'Estación intermedia', 'Gare intermédiaire', 'Mittelstation', 'Stazione intermedia', 'Estação intermédia', 'Middenstation', '中間駅', '중간 정류장', '中间站']],
  station: [['station', 'gare', 'stazione', 'bahnhof', 'estación', 'estação', '乗降場', '駅'],
    ['Station', 'Estación', 'Gare', 'Station', 'Stazione', 'Estação', 'Station', '駅', '역', '站']],
  chairlift: [['chairlift', 'chair lift', 'chair', 'télésiège', 'telesiege', 'sesselbahn', 'sessellift', 'seggiovia', 'telesilla', 'チェアリフト', 'ペアリフト', 'クワッドリフト'],
    ['Chairlift', 'Telesilla', 'Télésiège', 'Sessellift', 'Seggiovia', 'Telecadeira', 'Stoeltjeslift', 'チェアリフト', '체어리프트', '吊椅缆车']],
  gondola: [['gondola', 'gondelbahn', 'kabinenbahn', 'télécabine', 'telecabine', 'telecabina', 'cabinovia', 'ゴンドラ'],
    ['Gondola', 'Telecabina', 'Télécabine', 'Gondelbahn', 'Cabinovia', 'Telecabine', 'Gondelbaan', 'ゴンドラ', '곤돌라', '吊厢缆车']],
  cablecar: [['cable car', 'aerial tram', 'tram', 'téléphérique', 'telepherique', 'seilbahn', 'luftseilbahn', 'pendelbahn', 'funivia', 'teleférico', 'ロープウェイ'],
    ['Cable car', 'Teleférico', 'Téléphérique', 'Seilbahn', 'Funivia', 'Teleférico', 'Kabelbaan', 'ロープウェイ', '케이블카', '索道']],
  funicular: [['funicular', 'funiculaire', 'standseilbahn', 'funicolare', 'zahnradbahn', 'cog railway'],
    ['Funicular', 'Funicular', 'Funiculaire', 'Standseilbahn', 'Funicolare', 'Funicular', 'Kabelspoorweg', 'ケーブルカー', '푸니쿨라', '缆索铁路']],
  draglift: [['téléski', 'teleski', 'schlepplift', 'skilift', 'sciovia', 't-bar', 'tbar', 'platter', 'surface lift', 'button lift', 'bügellift', 'tellerlift', 'telesquí'],
    ['Drag lift', 'Telesquí', 'Téléski', 'Schlepplift', 'Sciovia', 'Telesqui', 'Sleeplift', 'Tバーリフト', 'T바 리프트', '拖牵']],
  ropetow: [['rope tow', 'seillift', 'fil neige', 'fil-neige', 'tapis-neige'],
    ['Rope tow', 'Cuerda de arrastre', 'Fil-neige', 'Seillift', 'Manovia', 'Corda de reboque', 'Touwlift', 'ロープトウ', '로프 토우', '拖绳']],
  carpet: [['magic carpet', 'förderband', 'zauberteppich', 'tapis roulant', 'tappeto', 'tappeto mobile', 'cinta transportadora'],
    ['Magic carpet', 'Cinta transportadora', 'Tapis roulant', 'Förderband', 'Tappeto mobile', 'Tapete rolante', 'Lopende band', 'ムービングベルト', '무빙워크', '魔毯']],
  practicelift: [['übungslift', 'kinderlift', 'babylift', 'baby lift', 'kids lift'],
    ['Beginner lift', 'Remonte de principiantes', 'Remontée débutants', 'Übungslift', 'Impianto principianti', 'Elevador de iniciação', 'Oefenlift', '初心者用リフト', '초보자 리프트', '初学者缆车']],
  lift: [['lift', 'remontée', 'impianto', 'リフト'],
    ['Lift', 'Remonte', 'Remontée', 'Lift', 'Impianto', 'Elevador', 'Lift', 'リフト', '리프트', '缆车']],
  skischool: [['ski school', 'skischule', 'schischule', 'école de ski', 'ecole de ski', 'scuola sci', 'scuola di sci', 'escuela de esquí', 'ski & ride school', 'ski and ride school', 'snowsports school'],
    ['Ski school', 'Escuela de esquí', 'École de ski', 'Skischule', 'Scuola sci', 'Escola de esqui', 'Skischool', 'スキースクール', '스키 학교', '滑雪学校']],
  rental: [['rental', 'rentals', 'verleih', 'noleggio', 'alquiler'],
    ['Rental', 'Alquiler', 'Location', 'Verleih', 'Noleggio', 'Aluguer', 'Verhuur', 'レンタル', '대여', '租赁']],
  skirental: [['ski rental', 'ski rentals', 'skiverleih', 'location de ski', 'location ski', 'noleggio sci', 'sportverleih'],
    ['Ski rental', 'Alquiler de esquís', 'Location de ski', 'Skiverleih', 'Noleggio sci', 'Aluguer de esqui', 'Skiverhuur', 'スキーレンタル', '스키 대여', '滑雪器材租赁']],
  shop: [['shop', 'store', 'laden', 'geschäft', 'negozio', 'tienda', 'loja', 'ski shop', 'sportgeschäft'],
    ['Shop', 'Tienda', 'Boutique', 'Geschäft', 'Negozio', 'Loja', 'Winkel', 'ショップ', '상점', '商店']],
  tourist: [['office de tourisme', 'tourist office', 'tourist information', 'tourist info', 'tourismusbüro', 'tourismusverband', 'tourist-information', 'ufficio turistico', 'oficina de turismo', 'information center', 'visitor center', 'welcome center'],
    ['Tourist office', 'Oficina de turismo', 'Office de tourisme', 'Tourismusbüro', 'Ufficio turistico', 'Posto de turismo', 'Toeristenbureau', '観光案内所', '관광 안내소', '旅游咨询处']],
  tickets: [['ticket office', 'tickets', 'ticket', 'lift tickets', 'lift ticket', 'ski lift tickets', 'billetterie', 'caisse', 'caisses', 'kasse', 'kassa', 'biglietteria', 'taquilla', 'ticket window'],
    ['Ticket office', 'Taquilla', 'Billetterie', 'Kasse', 'Biglietteria', 'Bilheteira', 'Kassa', 'チケット売り場', '매표소', '售票处']],
  parking: [['parking', 'car park', 'parkplatz', 'parkhaus', 'parcheggio', 'aparcamiento', 'estacionamiento', 'parking lot', '駐車場'],
    ['Parking', 'Aparcamiento', 'Parking', 'Parkplatz', 'Parcheggio', 'Estacionamento', 'Parkeerplaats', '駐車場', '주차장', '停车场']],
  lake: [['lake', 'see', 'lac', 'lago', 'laghetto', 'weiher', '湖'],
    ['Lake', 'Lago', 'Lac', 'See', 'Lago', 'Lago', 'Meer', '湖', '호수', '湖']],
  summit: [['summit', 'gipfel', 'sommet', 'cima', 'vetta', 'cumbre', 'pic', 'spitze'],
    ['Summit', 'Cumbre', 'Sommet', 'Gipfel', 'Cima', 'Cume', 'Top', '山頂', '정상', '山顶']],
  mount: [['mount', 'mt.', 'mt', 'mont', 'monte', '山'],
    ['Mount', 'Monte', 'Mont', 'Berg', 'Monte', 'Monte', 'Berg', '山', '산', '山']],
  glacier: [['glacier', 'gletscher', 'ghiacciaio', 'glaciar'],
    ['Glacier', 'Glaciar', 'Glacier', 'Gletscher', 'Ghiacciaio', 'Glaciar', 'Gletsjer', '氷河', '빙하', '冰川']],
  pass: [['col', 'pass', 'passo', 'joch', 'sattel', 'puerto', 'colle'],
    ['Pass', 'Puerto', 'Col', 'Pass', 'Passo', 'Passo', 'Pas', '峠', '고개', '山口']],
  base: [['base area', 'base', 'base lodge', 'pied des pistes', 'front de neige'],
    ['Base area', 'Zona base', 'Pied des pistes', 'Talbereich', 'Area base', 'Área base', 'Basisgebied', 'ベースエリア', '베이스', '山脚区']],
  center: [['center', 'centre', 'zentrum', 'centro'],
    ['Center', 'Centro', 'Centre', 'Zentrum', 'Centro', 'Centro', 'Centrum', 'センター', '센터', '中心']],
  village: [['village', 'dorf', 'villaggio', 'pueblo', 'aldea', 'dörfl'],
    ['Village', 'Pueblo', 'Village', 'Dorf', 'Villaggio', 'Aldeia', 'Dorp', '村', '마을', '村']],
  church: [['church', 'kirche', 'pfarrkirche', 'église', 'eglise', 'chiesa', 'iglesia', 'igreja'],
    ['Church', 'Iglesia', 'Église', 'Kirche', 'Chiesa', 'Igreja', 'Kerk', '教会', '교회', '教堂']],
  chapel: [['chapel', 'kapelle', 'chapelle', 'cappella', 'capilla', 'capela'],
    ['Chapel', 'Capilla', 'Chapelle', 'Kapelle', 'Cappella', 'Capela', 'Kapel', '礼拝堂', '예배당', '小教堂']],
  patrol: [['ski patrol', 'first aid', 'pistenrettung', 'bergrettung', 'secours', 'poste de secours', 'pisteurs', 'soccorso', 'soccorso piste', 'pronto soccorso', 'patrol'],
    ['Ski patrol', 'Patrulla de esquí', 'Secours des pistes', 'Pistenrettung', 'Soccorso piste', 'Patrulha de esqui', 'Skipatrouille', 'スキーパトロール', '스키 패트롤', '滑雪巡逻']],
  toilets: [['toilets', 'toilet', 'restrooms', 'restroom', 'wc', 'toilettes', 'toiletten', 'bagni', 'servizi'],
    ['Toilets', 'Aseos', 'Toilettes', 'Toiletten', 'Bagni', 'Casas de banho', 'Toiletten', 'トイレ', '화장실', '厕所']],
  park: [['terrain park', 'snowpark', 'snow park', 'funpark', 'fun park', 'snowpark'],
    ['Terrain park', 'Snowpark', 'Snowpark', 'Funpark', 'Snowpark', 'Snowpark', 'Snowpark', 'スノーパーク', '스노우 파크', '单板公园']],
  resort: [['ski area', 'ski resort', 'skigebiet', 'domaine skiable', 'station de ski', 'comprensorio', 'スキー場'],
    ['Ski resort', 'Estación de esquí', 'Station de ski', 'Skigebiet', 'Comprensorio sciistico', 'Estância de esqui', 'Skigebied', 'スキー場', '스키장', '滑雪场']],
  house: [['haus', 'maison', 'casa', 'huis'],
    ['House', 'Casa', 'Maison', 'Haus', 'Casa', 'Casa', 'Huis', 'ハウス', '하우스', '之家']],
  apartment: [['appartement', 'appartements', 'apartment', 'apartments', 'ferienwohnung', 'appartamento', 'appartamenti', 'apartamento', 'condominio', 'résidence'],
    ['Apartments', 'Apartamentos', 'Appartements', 'Ferienwohnungen', 'Appartamenti', 'Apartamentos', 'Appartementen', 'アパートメント', '아파트', '公寓']],
  firestation: [['feuerwehr', 'pompiers', 'vigili del fuoco', 'fire station', 'bomberos'],
    ['Fire station', 'Bomberos', 'Pompiers', 'Feuerwehr', 'Vigili del fuoco', 'Bombeiros', 'Brandweer', '消防署', '소방서', '消防站']],
  pharmacy: [['pharmacy', 'pharmacie', 'apotheke', 'farmacia'],
    ['Pharmacy', 'Farmacia', 'Pharmacie', 'Apotheke', 'Farmacia', 'Farmácia', 'Apotheek', '薬局', '약국', '药店']],
  bakery: [['bakery', 'boulangerie', 'bäckerei', 'panificio', 'panadería'],
    ['Bakery', 'Panadería', 'Boulangerie', 'Bäckerei', 'Panificio', 'Padaria', 'Bakkerij', 'パン屋', '빵집', '面包店']],
  supermarket: [['supermarket', 'supermarché', 'supermarkt', 'supermercato', 'supermercado', 'market', 'markt'],
    ['Supermarket', 'Supermercado', 'Supermarché', 'Supermarkt', 'Supermercato', 'Supermercado', 'Supermarkt', 'スーパー', '슈퍼마켓', '超市']],
  viewpoint: [['viewpoint', 'aussichtspunkt', 'aussicht', 'belvédère', 'belvedere', 'mirador', 'panorama point'],
    ['Viewpoint', 'Mirador', 'Belvédère', 'Aussichtspunkt', 'Belvedere', 'Miradouro', 'Uitkijkpunt', '展望台', '전망대', '观景台']],
  pump: [['pumpstation', 'pompaggio', 'pumphouse', 'pump house'],
    ['Pump station', 'Estación de bombeo', 'Station de pompage', 'Pumpstation', 'Stazione di pompaggio', 'Estação de bombagem', 'Pompstation', 'ポンプ場', '펌프장', '泵站']],
  playground: [['playground', 'spielplatz', 'aire de jeux', 'parco giochi'],
    ['Playground', 'Parque infantil', 'Aire de jeux', 'Spielplatz', 'Parco giochi', 'Parque infantil', 'Speeltuin', '遊び場', '놀이터', '游乐场']],
  foodcourt: [['food court', 'フードコート'],
    ['Food court', 'Zona de restaurantes', 'Aire de restauration', 'Food-Court', 'Area ristoro', 'Praça de alimentação', 'Foodcourt', 'フードコート', '푸드코트', '美食广场']],
  boarding: [['乗降場'],
    ['Boarding area', 'Zona de embarque', 'Embarquement', 'Einstieg', 'Imbarco', 'Embarque', 'Instapplaats', '乗降場', '승하차장', '上下车处']],
  medical: [['medical clinic', 'centre médical', 'centre medical', 'medical center', 'medical centre', 'centro medico', 'arzt', 'arztpraxis', 'clinic', 'clinique', 'médecin', 'medecin'],
    ['Medical centre', 'Centro médico', 'Centre médical', 'Arztpraxis', 'Centro medico', 'Centro médico', 'Medisch centrum', '診療所', '의료 센터', '医疗中心']],
  holiday: [['ferienhaus', 'casa vacanze', 'maison de vacances', 'vacation home', 'holiday home'],
    ['Holiday home', 'Casa de vacaciones', 'Maison de vacances', 'Ferienhaus', 'Casa vacanze', 'Casa de férias', 'Vakantiehuis', '別荘', '별장', '度假屋']],
  country: [['landhaus', 'country house'],
    ['Country house', 'Casa de campo', 'Maison de campagne', 'Landhaus', 'Casa di campagna', 'Casa de campo', 'Landhuis', 'カントリーハウス', '시골집', '乡间别墅']],
  forest: [['wald', 'forêt', 'bosco', 'bosque', 'forest', 'woods'],
    ['Forest', 'Bosque', 'Forêt', 'Wald', 'Bosco', 'Floresta', 'Bos', '森', '숲', '森林']],
  school: [['school', 'schule', 'école', 'scuola', 'escuela', 'internat'],
    ['School', 'Escuela', 'École', 'Schule', 'Scuola', 'Escola', 'School', '学校', '학교', '学校']],
};
// "of" words, translated only when something else in the name was
const OF = { words: ['de', 'du', 'des', "d'", 'di', 'del', 'della', 'dei', 'delle', 'von', 'vom'], tr: ['of', 'de', 'de', 'von', 'di', 'de', 'van', 'の', '', '的'] };
// articles dropped in front of a translated word ("Le Lac Blanc" -> "Lake Blanc")
const ARTICLES = new Set(['le', 'la', 'les', "l'", 'il', 'lo', 'gli', 'el', 'los', 'las', 'der', 'die', 'das', 'the']);
// Words a reader of that language already reads as their own: never "translated" into a synonym
// ("Golden Peak Lodge" stays as it is for an English reader).
const NATIVE = {
  en: 'hut cabin lodge lodges peak summit mount mt mt. bistro pub bar store shop market rental rentals ticket tickets inn guesthouse hotel restaurant cafe café center centre tram chair chairlift gondola base village school house station lake pass forest woods park snowpark funpark apartment apartments clinic toilets restrooms restroom playground viewpoint bakery pharmacy chapel church glacier',
  de: 'hütte huette hüttn alm alp alpe stube stubn stüberl stübli beisl gasthaus gasthof wirtshaus pension gästehaus hotel berghotel berghaus kaffee café cafe bar pub bistro restaurant bergrestaurant bergstation talstation mittelstation station bahnhof sesselbahn sessellift gondelbahn kabinenbahn seilbahn luftseilbahn pendelbahn standseilbahn zahnradbahn schlepplift skilift bügellift tellerlift seillift förderband zauberteppich übungslift kinderlift babylift lift skischule schischule skiverleih sportverleih verleih laden geschäft sportgeschäft shop tourismusbüro tourismusverband kasse kassa parkplatz parkhaus see weiher gipfel spitze berg gletscher pass joch sattel zentrum dorf dörfl kirche kapelle pistenrettung bergrettung toiletten wc funpark snowpark skigebiet haus ferienwohnung ferienhaus landhaus appartement feuerwehr apotheke bäckerei supermarkt markt aussichtspunkt aussicht pumpstation spielplatz wald schule internat arzt arztpraxis',
  fr: 'refuge cabane alpage restaurant brasserie auberge pension hôtel hotel café cafe cafétéria bar bistro gare télésiège telesiege télécabine telecabine téléphérique telepherique funiculaire téléski teleski fil-neige remontée location boutique billetterie caisse caisses parking lac sommet pic mont glacier col centre village église eglise chapelle secours pisteurs toilettes wc snowpark maison appartement appartements résidence pompiers pharmacie boulangerie supermarché belvédère forêt école clinique médecin',
  it: 'rifugio capanna baita alpe alpeggio ristorante trattoria osteria locanda pensione hotel albergo caffè caffe bar stazione seggiovia cabinovia funivia funicolare sciovia impianto noleggio negozio biglietteria parcheggio lago laghetto cima vetta monte ghiacciaio passo colle centro villaggio chiesa cappella soccorso bagni servizi comprensorio casa appartamento appartamenti condominio farmacia panificio supermercato belvedere bosco scuola',
  es: 'refugio restaurante posada pensión hotel cafetería café bar estación telesilla telecabina teleférico funicular telesquí remonte alquiler tienda taquilla aparcamiento estacionamiento lago cumbre monte glaciar puerto centro pueblo aldea iglesia capilla casa apartamento farmacia panadería supermercado mirador bosque escuela',
  pt: 'refúgio restaurante pousada pensão hotel café bar estação telecadeira telecabine teleférico funicular elevador aluguer loja bilheteira estacionamento lago cume monte glaciar passo centro aldeia igreja capela casa apartamento farmácia padaria supermercado miradouro floresta escola',
  nl: 'hut restaurant herberg pension hotel café bar station stoeltjeslift gondelbaan kabelbaan sleeplift lift verhuur winkel kassa parkeerplaats meer berg gletsjer pas centrum dorp kerk kapel huis appartement apotheek bakkerij supermarkt bos school',
};
// English phrases an English reader needs no help with
const NATIVE_EN_PHRASES = ['ski rental', 'ski rentals', 'ski shop', 'lift tickets', 'lift ticket', 'ski lift tickets', 'ticket office', 'surface lift', 'ski school', 'magic carpet', 'rope tow', 't-bar', 'platter', 'base area', 'base lodge', 'terrain park', 'snow park', 'first aid', 'ski patrol', 'tourist office', 'tourist information', 'visitor center', 'welcome center', 'information center', 'car park', 'parking lot', 'food court', 'mid station', 'middle station', 'top station', 'summit station', 'bottom station', 'base station', 'chair lift', 'cable car', 'aerial tram', 'medical center', 'medical clinic', 'button lift', 'kids lift', 'baby lift', 'snowsports school', 'ski & ride school', 'ski and ride school', 'pump house', 'cog railway', 'country house', 'holiday home', 'vacation home', 'ski area', 'ski resort'];
const NAT = Object.fromEntries(Object.entries(NATIVE).map(([k, v]) => [k, new Set(v.split(' ').map((w) => w.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()))]));
for (const p of NATIVE_EN_PHRASES) NAT.en.add(p);
// endings of joined-up German words that are worth translating ("Gandegghütte" -> Gandegg + hut)
// (not -dorf, -wald or -haus: those end the names of towns and houses, "Westendorf")
const SUFFIXES = ['hütte', 'huette', 'alm', 'alpe', 'bergstation', 'talstation', 'mittelstation', 'station', 'bahnhof', 'stube', 'stübli', 'stüberl', 'stubn', 'see', 'kapelle', 'kirche', 'gasthof', 'gasthaus', 'restaurant', 'hotel', 'sessellift', 'sesselbahn', 'gondelbahn', 'seilbahn', 'schlepplift', 'skilift', 'lift', 'gletscher', 'spitze', 'gipfel', 'joch', 'sattel', 'parkplatz', 'kasse', 'schule'];
// whole names that word-by-word cannot handle
const WHOLE = {
  '兎森山': ['Mount Usagimori', 'Monte Usagimori', 'Mont Usagimori', 'Berg Usagimori', 'Monte Usagimori', 'Monte Usagimori', 'Usagimoriberg', '兎森山', '우사기모리산', '兔森山'],
  '夏油高原スキー場': ['Geto Kogen Ski Resort', 'Estación de esquí Geto Kogen', 'Station de ski de Geto Kogen', 'Skigebiet Geto Kogen', 'Comprensorio sciistico Geto Kogen', 'Estância de esqui Geto Kogen', 'Skigebied Geto Kogen', '夏油高原スキー場', '게토 고원 스키장', '夏油高原滑雪场'],
  'ゴンドラ乗降場': ['Gondola boarding area', 'Embarque de la telecabina', 'Embarquement télécabine', 'Gondel-Einstieg', 'Imbarco cabinovia', 'Embarque da telecabine', 'Instapplaats gondel', 'ゴンドラ乗降場', '곤돌라 승하차장', '吊厢缆车上下车处'],
};

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const LOOK = new Map();          // folded word or phrase -> concept
let maxWords = 1;
for (const [k, [words]] of Object.entries(C)) for (const w of words) {
  LOOK.set(fold(w), k);
  maxWords = Math.max(maxWords, w.split(' ').length);
}
const SUF = SUFFIXES.map((s) => [fold(s), LOOK.get(fold(s))]).filter(([, k]) => k).sort((a, b) => b[0].length - a[0].length);
const OFSET = new Set(OF.words);
const cache = new Map();

/** The name's meaning in language `lang` (default: the app's), or null when there is nothing to add. */
export function placeTr(name, lang = getLang()) {
  if (!name) return null;
  const key = lang + '|' + name;
  if (cache.has(key)) return cache.get(key);
  const out = translate(name, lang);
  cache.set(key, out);
  return out;
}

function translate(name, lang) {
  const li = L.indexOf(lang);
  if (li < 0) return null;
  const core = name.replace(/\s*\((top|base)\)$/, '').trim();
  if (WHOLE[core]) return differs(core, WHOLE[core][li]);
  // a Japanese name: try its known endings
  if (/[぀-ヿ一-鿿]/.test(core) && !/\s/.test(core)) {
    for (const [w, k] of [...LOOK].filter(([w]) => /[぀-ヿ一-鿿]/.test(w)).sort((a, b) => b[0].length - a[0].length)) {
      if (core === w) return differs(core, C[k][1][li]);
    }
    return null;
  }
  const words = core.split(/\s+/);
  const out = [];              // {t: text, c: concept?, of?: true}
  let changed = 0;
  for (let i = 0; i < words.length;) {
    let hit = null;
    for (let n = Math.min(maxWords, words.length - i); n >= 1 && !hit; n--) {
      const ph = words.slice(i, i + n).join(' ');
      const k = LOOK.get(fold(ph.replace(/^[(«"]+|[)»",.:;!]+$/g, '')));
      if (k) hit = { n, k, src: ph };
    }
    if (hit) {
      const src = hit.src.replace(/^[(«"]+|[)»",.:;!]+$/g, '');
      if (NAT[lang]?.has(fold(src))) { out.push({ t: hit.src }); i += hit.n; continue; }
      const tr = C[hit.k][1][li];
      if (fold(tr) !== fold(src)) changed++;
      while (out.length && ARTICLES.has(fold(out[out.length - 1].t)) && !out[out.length - 1].c) out.pop();
      if (out.length && out[out.length - 1].t === tr) { i += hit.n; continue; }    // "Condominio Residence" -> one "Apartments"
      out.push({ t: tr, c: true });
      i += hit.n; continue;
    }
    const w = words[i], fw = fold(w);
    if (OFSET.has(fw) || /^d['’]/.test(fw)) {
      out.push({ t: w, of: true, rest: /^d['’]./.test(fw) ? w.slice(2) : '' });
      i++; continue;
    }
    // joined-up German word ending in a known word
    const suf = fw.length > 6 && !NAT[lang]?.has(fw) && SUF.find(([s]) => fw.endsWith(s) && fw.length - s.length >= 3);
    if (suf && !NAT[lang]?.has(suf[0])) {
      const stem = w.slice(0, w.length - suf[0].length).replace(/-$/, '');
      const head = C[suf[1]][1][li];
      {
        changed++;
        const stemTr = LOOK.get(fold(stem));
        const st = stemTr ? C[stemTr][1][li] : stem;
        out.push({ t: HEAD_FIRST.has(lang) ? `${head} ${st}` : CJK.has(lang) ? `${st}${head}` : `${st} ${head}`, c: true });
      }
      i++; continue;
    }
    out.push({ t: w }); i++;
  }
  if (!changed) return null;
  const text = out.map((o) => {
    if (!o.of) return o.t;
    const ofw = OF.tr[li];
    return (ofw + (o.rest ? ' ' + o.rest : '')).trim();
  }).filter(Boolean).join(' ');
  return differs(core, text);
}

function differs(name, tr) {
  if (!tr) return null;
  const a = fold(name).replace(/[^\p{L}\p{N}]/gu, ''), b = fold(tr).replace(/[^\p{L}\p{N}]/gu, '');
  return a === b ? null : tr;
}
