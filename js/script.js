let DICTIONARY = ["abadi", "ala","aba","asa", "abai", "abang", "abu", "adik", "adonan", "ajaib", "akar", "aksara", "alam"];

// Semua kata (customWords, blocked, kompe segment, hasil import kamus) itu
// user-controlled -- gak ada jaminan isinya "kata" beneran (bisa aja HTML/JS
// kalau orangnya iseng/jahat). Titik render manapun yang nyuntik string itu
// ke innerHTML WAJIB lewat sini dulu, biar karakter berbahaya (<, >, &, ", ')
// ditampilin sebagai teks biasa, bukan dieksekusi sebagai markup.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Kata Indonesia beneran cuma huruf kecil -- pola yang sama juga dipake di
// backend (isSafeReportedWord) buat nolak kata pas dilaporin. Ditaro di sini
// juga biar bisa nolak dari sumbernya (form tambah kata & import kamus),
// bukan cuma pas dilaporin ke server doang.
const SAFE_WORD_PATTERN = /^[a-z]{2,86}$/;

// Nyalain tombol X di semua input yang punya .input-clear-btn di dalem
// .input-wrap yang sama. scope opsional -- default nyariin ke seluruh
// document, atau dikasih elemen tertentu (misal abis innerHTML di-render
// ulang) biar gak query ulang ke seluruh halaman.
function setupClearButtons(scope) {
  const root = scope || document;
  root.querySelectorAll('.input-clear-btn').forEach(btn => {
    if (btn.dataset.clearWired) return;
    const input = document.getElementById(btn.dataset.clearFor);
    if (!input) return;
    btn.dataset.clearWired = '1';
    const sync = () => btn.classList.toggle('visible', !!input.value);
    sync();
    input.addEventListener('input', sync);
    btn.addEventListener('click', () => {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    });
  });
}

// Dropdown custom pengganti <select> native. Beberapa in-app browser (Discord dkk)
// suka gak nampilin popup <select> bawaan, jadi semua dropdown pilihan dipindah ke
// komponen ini. Elemen root-nya tetap punya .value dan nembak event 'change' biasa,
// jadi kode yang udah addEventListener('change', ...) di tempat lain gak perlu diubah.
function setCustomSelectValue(rootEl, value, fireChange) {
  if (!rootEl) return;
  const opt = rootEl.querySelector(`.custom-select-option[data-value="${CSS.escape(value)}"]`);
  if (!opt) return;
  rootEl.value = value;
  rootEl.querySelectorAll('.custom-select-option').forEach(o => o.classList.toggle('active', o === opt));
  const label = rootEl.querySelector('.custom-select-trigger-label');
  if (label) label.textContent = opt.textContent;
  if (fireChange) rootEl.dispatchEvent(new Event('change'));
}

function initCustomSelect(rootEl) {
  if (!rootEl) return;
  const trigger = rootEl.querySelector('.custom-select-trigger');
  const dropdown = rootEl.querySelector('.custom-select-dropdown');
  const activeOpt = rootEl.querySelector('.custom-select-option.active') || rootEl.querySelector('.custom-select-option');
  if (activeOpt) setCustomSelectValue(rootEl, activeOpt.dataset.value, false);

  trigger.addEventListener('click', e => {
    e.stopPropagation();
    document.querySelectorAll('.custom-select.open').forEach(el => { if (el !== rootEl) el.classList.remove('open'); });
    rootEl.classList.toggle('open');
  });
  dropdown.addEventListener('click', e => {
    const opt = e.target.closest('.custom-select-option');
    if (!opt) return;
    setCustomSelectValue(rootEl, opt.dataset.value, true);
    rootEl.classList.remove('open');
  });
  dropdown.addEventListener('click', e => e.stopPropagation());
}

document.addEventListener('click', e => {
  document.querySelectorAll('.custom-select.open').forEach(el => {
    if (!el.contains(e.target)) el.classList.remove('open');
  });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.custom-select.open').forEach(el => el.classList.remove('open'));
});
document.querySelectorAll('.custom-select').forEach(initCustomSelect);

let mode = "awalan";
let view = "list";
let sortMode = "az";
let favOnly = false;
let customOnly = false;
let favorites = [];
let favoritesSet = new Set();
let blocked = [];
let customWords = [];
let customWordsSet = new Set(customWords);
let baseDictSet = new Set();
let query = { awalan: "", akhiran:   "", mengandung: "" };

const DICTIONARY_VERSION = '1.11.2';

// Riwayat update yang ditampilin ke user lewat modal "Update Log". Entry paling
// atas = paling baru. Tiap entry WAJIB diisi manual pas rilis (gak ada auto-diff).
// Trigger auto-muncul modal cuma baca major.minor (2 digit pertama) dari versi
// entry paling atas -- jadi update kamus doang (digit patch/ke-3) gak bakal
// nge-trigger modal ini nongol sendiri. dictionaryChanges opsional, cuma diisi
// kalau emang ada kata yang ditambah/dihapus di rilis itu, contoh:
// dictionaryChanges: { added: ['katabaru1'], removed: ['katalama1'] }
const UPDATE_LOG = [
  {
    version: '1.11.0',
    date: '16 Sep 2026',
    changes: [
      'Menambahkan shortcut untuk pengguna pc(cara penggunaan dapat dilihat di server discord)',
      'Menambahkan 30 kata baru, dan menghapus 114 kata invalid.'
    ],
    version: '1.9.0',
    date: '11 Sep 2026',
    changes: [
      'Perbaikan autofill browser yang sempat nyasar ke kotak search/kompe/push',
      'Perbaikan kata yang bisa hilang kalau push lalu langsung logout',
      'Perbaikan login yang sempat kerasa lambat',
      'Menambahkan 33 kata baru, dan menghapus 122 kata invalid.' 
    ],
  },
  {
    version: '1.8.0',
    date: '7 Sep 2026',
    changes: [
      'Penambahan fitur \'lupa password\'',
      'Menambahkan 59 kata baru, dan menghapus 127 kata invalid.'      
    ],
    
  },
  {
    version: '1.7.1',
    date: '4 Sep 2026',
    changes: [
      'Penambahan import dan export untuk preset mode kompe, dapat di cek di pengaturan',      
    ],
    
  },
  {
    version: '1.6.1',
    date: '4 Sep 2026',
    changes: [
      'Dalam mode kompe, sekarang dapat push semua kata sekaligus, dan dapat memilih rentang yang sudah dipush',
      'CATATAN: rentang yang dipush hanya berlaku selain filter acak.'
      
    ],
    
  },
  {
    version: '1.5.0',
    date: '1 Sep 2026',
    changes: [
      'Mode Kompe: Menambahkan fitur preset trap',
      ' Menambahkan dan menghapus beberapa kata'
    ],
    
  },
  {
    version: '1.4.2',
    date: '29 Agu 2026',
    changes: [
      'Update kamus kata: menambahkan 4.873 kata baru. Diambil dari merek dagang obat obatan',
    ],
    
  },
  {
    version: '1.4.1',
    date: '29 Agu 2026',
    changes: [
      'Update kamus kata: mengubah kata yang tidak valid. Banyaknya kata tetap sama',
    ],
    
  },
  {
    version: '1.4.0',
    date: '28 Agu 2026',
    changes: [
      'Update kamus kata: Ditambahkan sebanyak 8.841 kata baru.',
    ],
    
  },
  {
    version: '1.3.1',
    date: '27 Agu 2026',
    changes: [
      'Update kamus kata: 6 kata baru ditambahkan, 177 kata tidak valid dihapus',
    ],
    dictionaryChanges: {
  added: [
    'ayabacensis', 'huilana', 'nigritana', 'qianyuensis', 'rabaraba', 'xairuensis',
  ],
  removed: [
    'ahrensi', 'baiyungshanica', 'balil', 'bandorasakulon', 'bandorasawetan', 'bertangkil',
    'bertumpak', 'biakromial', 'bkpsdm', 'bolm', 'brgm', 'bskap', 'butim', 'cacahjiwa', 'camp',
    'civitas', 'cpm', 'davaoana', 'dbal', 'dbl', 'degola', 'diversipennis', 'djs', 'dolens',
    'dpi', 'dpl', 'dppt', 'dpshpln', 'dragee', 'ducur', 'dudak', 'dukuhlor', 'dupati',
    'duriankari', 'duvivieri', 'fasal', 'felschei', 'fuscescens', 'harmonica', 'heptophylla',
    'himalayica', 'hirtella', 'hirtuosa', 'hobokoana', 'hodkovae', 'holisonycha', 'holosericea',
    'holzschuhi', 'hongkongica', 'hopei', 'hoplia', 'humbloti', 'humboldti', 'kahfi', 'keniana',
    'khasiana', 'khoina', 'lampei', 'lebisi', 'limbangica', 'livada', 'madurana', 'maedai',
    'megu', 'mirak', 'mkdu', 'mongak', 'morbidi', 'morituri', 'motandoi', 'moultoni', 'moyu',
    'mulajadi', 'multifoliata', 'multiguttata', 'murzini', 'mutakalliman', 'mystaca',
    'oksineurine', 'oliver', 'ollivieri', 'ovatula', 'ovina', 'panamping', 'passer', 'pilat',
    'pkt', 'pkwt', 'pkwtt', 'pmse', 'ppiu', 'ppju', 'ppnpn', 'ppsu', 'ppu', 'ratcliffei',
    'rechencqui', 'reichenowi', 'renardi', 'retusa', 'rhypha', 'ribbei', 'roulleaui', 'rufula',
    'saitoi', 'sempiterna', 'serensia', 'setiserica', 'sherpa', 'shouchiana', 'sibayau',
    'simlana', 'singalangia', 'siniaevi', 'sinuaticeps', 'siwalikiana', 'sladeni', 'smasher',
    'sogai', 'sontica', 'spbklu', 'spei', 'sphaerica', 'spilota', 'spissa', 'spklu',
    'splendidula', 'sponsa', 'spreta', 'staturosa', 'stipidosa', 'stolida', 'straminea',
    'strbai', 'strigata', 'strumina', 'suavidica', 'subaana', 'subnisa', 'subpilosa',
    'subrugata', 'subsquamosa', 'subtruncata', 'sudhausi', 'tayanpingensis', 'teluroides',
    'theodoroensis', 'tienchihna', 'tifani', 'tkdv', 'tknv', 'togoana', 'tokejii', 'tomiensis',
    'trichofemorata', 'trichotibialis', 'tridenticeps', 'tridentipes', 'trochaloschema',
    'trociformis', 'tronton', 'tropdeana', 'tryznai', 'tsaratanoplia', 'tsin', 'ttv', 'tuanan',
    'tukucheana', 'tunjun', 'tyrannica', 'wailukum', 'walunhelat', 'weskop', 'wksbm', 'wput',
    'zanzibarica', 'zom',
  ],
    },
  },
  {
  version: '1.3.0',
  date: '24 Agu 2026',
  changes: [
    'Perbaikan bug login',
    'Update kamus: 8 kata ditambahkan, 113 kata dihapus',
    'Peringatan Push Index: jika kata sudah digunakan dan valid, jangan klik X. Tekan kata tersebut untuk menandakan sudah di push/ sudah masuk index.',
  ],
  dictionaryChanges: {
    added: ['bicornuta', 'holathera', 'jefestigma', 'sageaensis', 'trachycaulos', 'xiana', 'yechengensis', 'yechengnica'],
    removed: ['epistemologisme', 'existence', 'kampan', 'kasetan', 'miu', 'omos', 'ontos', 'opes', 'oxalis', 'sanglo', 'syuudzon', 'kryzhanovskii', 'ktromiografi', 'lineopictus', 'lisboasaurus', 'ltoid', 'meiguensis', 'meknesensis', 'muliensis', 'mureensis', 'mussooriensis', 'mycernus', 'nicu', 'nikolaji', 'nomurai', 'nossi', 'okinawaensis', 'oncochirus', 'opaciclypealis', 'opacipennis', 'opaciventris', 'oudjdensis', 'pachypoides', 'padangensis', 'panganiensis', 'paramorphochelus', 'paraquinquidens', 'pempas', 'pempis', 'pencas', 'pendas', 'pennas', 'pentis', 'pentus', 'pokurumba', 'ppe', 'pppsrs', 'rforator', 'ritsemae', 'rufoplagiata', 'semipubescens', 'senegalensis', 'seorsus', 'sericeoides', 'sericoides', 'seticeps', 'setifrons', 'setipennis', 'shaanxiensis', 'shibingensis', 'shihzitouensis', 'siargaoensis', 'signatitarsis', 'signativentris', 'significabilis', 'significans', 'sitoliensis', 'soppongensis', 'taoyuanensis', 'tapakkuda', 'winkler', 'witing', 'kcbn', 'kanevskajae', 'kasigurana', 'hypolepida', 'hypothyce', 'hymenoplia', 'gravida', 'gopaldharae', 'gallana', 'elaisome', 'elisabethae', 'duplosetosa', 'dissensa', 'dita', 'ditissima', 'divulsa', 'doleroserica', 'dolichocera', 'delais', 'butuana', 'byoklokfle', 'byuha', 'badingkut', 'bersembur', 'bersambar', 'berpair', 'berliter', 'berligar', 'berkunar', 'berkotor', 'berketar', 'berjabir', 'bergalur', 'berdimbar', 'beggar', 'bbltr', 'bblsr', 'bapor', 'bapar', 'lgbt', 'buffer', 'broder', 'bouger', 'boomer', 'bojongkulur', 'berungkur', 'bertawar'],
  },
},
  {
    version: '1.2.0',
    date: '22 Agu 2026',
    changes: [
      'Optimasi performa pencarian',
      'Perbaikan keamanan',
      'Perbaikan login autofill',
    ],
    dictionaryChanges: {
      added: [
        'juanhintonianum', 'lilacinum',
      ],
      removed: [
        'badiipennis', 'bagmatiensis', 'bemem', 'bjt', 'bkmt', 'bkt', 'blt', 'blut',
        'bmkt', 'bnt', 'bst', 'cctv', 'cmv', 'cts', 'current', 'daktilo', 'daliensis', 'doms',
        'dpas', 'dprs', 'dps', 'dsps', 'eluctabilis', 'engana', 'enganoana', 'etiserica', 'eutrichesis', 'exoleta',
        'geilenkeuseri', 'gerstaeckeri', 'gorkhae',
        'impubis', 'inamoenus', 'infantilis', 'inops', 'insanabilis', 'intermediatus',
        'iraqensis', 'irididorsis', 'isarogensis', 'jabattangan', 'jaegeri', 'jagaddhita', 'jakel', 'jakman', 'jakuza',
        'jalapeno', 'jalesu', 'jalesveva', 'jalla', 'jamee', 'jangatnya', 'jannatul', 'jannatun', 'jape',
        'japeledok', 'jatianyar', 'jatidukuh', 'jatigunting', 'jauhan', 'jayenensis', 'jbi', 'jbk', 'jdih',
        'jebatan', 'jed', 'jedotkan', 'jedung', 'jejang', 'jelekan', 'jelid', 'jeljin', 'jerjeren',
        'jesu', 'jeu', 'jfa', 'jft', 'jfu', 'jht', 'jie', 'jifah', 'jign',
        'jikn', 'jimi', 'jindrai', 'jinggo', 'jinsiyyah', 'jiraskovae', 'jjm', 'jjs', 'jkk',
        'jkm', 'jkn', 'jkp', 'jmb', 'joachimi', 'jpd', 'jph', 'jpk', 'jpkm',
        'jpn', 'jpo', 'jppnu', 'jpsd', 'jpsk', 'jpu', 'jra', 'jtm', 'jualbeli',
        'jugalajaya', 'jugend', 'julurkan', 'junghuhni', 'jurupa', 'justa', 'koniskus', 'kuaichangensis', 'laeviscutata',
        'lineatipennis', 'liubangosaurus', 'madurensis', 'magnicornis', 'microplus', 'obscurella', 'oceana',
        'ochrosoma', 'okinoerabuana', 'olivacea', 'omanica', 'opacula', 'opalina', 'opima', 'oshimana', 'pantir',
        'panyir', 'panyur', 'ptidase', 'ptisisme', 'pusawah', 'push', 'putung', 'puunggoni', 'pyrrhopoecila',
        'qurtubi', 'raptiensis', 'raucipennis', 'rectidens', 'rectipennis', 'rhizotrogoides', 'rhyxicephalus', 'riffensis', 'rubricollis',
        'rufinoides', 'rufotibialis', 'rugifrons', 'rungbongensis', 'sandiegensis', 'saturella', 'scapanoclypeus', 'schenklingi', 'schereri',
        'schizochelus', 'schneideri', 'schoenherri', 'schoenmanni', 'scholtzi', 'sefroensis', 'segregata', 'semimurni', 'serica',
        'sericella', 'serotina', 'shukronajevi', 'sprecherae', 'sterilis', 'subcinerascens', 'subrugicollis', 'tifosa',
      ],
    },
  },
  {
    version: '1.1.2',
    date: '20 Agu 2026',
    changes: [
      'Update kamus kata: 15 kata baru ditambahkan, 200 kata tidak valid dihapus',
    ],
    dictionaryChanges: {
      added: [
        'almaleea', 'lentokonesuihkuturbiinimoottoriapumekaanikkoaliupseerioppilas',
        'differentiationinducingfactor', 'hipopotomonstroseskuipedaliofobik',
        'kindercarnavalsoptochtvoorbereidingswerkzaamhedencomite',
        'kraftfahrzeughaftpflichtversicherung', 'lisboasaurusliubangosaurus',
        'muvaffakiyetsizlestiricilestiriveremeyebileceklerimizdenmissinizcesine',
        'ornatotholusornithodesmus', 'precipitevolissimevolmente',
        'psiconeuroendocrinoimmunologia', 'pyroglutamylhistidyltryptophyl',
        'rindfleischetikettierungsueberwachungsaufgabenuebertragungsgesetz',
        'yamatensis', 'yubaridakensis',
      ],
      removed: [
        'ayaban', 'bums', 'cbp', 'dhe', 'eberti', 'ejimai', 'endroedii', 'escalerai', 'excisa', 'flpp',
        'fpb', 'fui', 'fursan', 'hogo', 'idaho', 'illigeri', 'imasakai', 'inflativentris', 'iridicolor',
        'kangdingensis', 'karafutoensis', 'kaskiensis', 'ketamensis', 'khajiaris', 'kinabaluensis',
        'klarifikatif', 'kolambugana', 'korsakoff', 'ktromotif', 'ktropositif', 'kuiluensis',
        'kumaonensis', 'kusuii', 'laeviplagiata', 'lalashana', 'laminifera', 'leigongshanica', 'lidur',
        'lignicolor', 'litangensis', 'lloydi', 'lodosi', 'lontor', 'lopatini', 'lucidifrons',
        'lucusensis', 'lugundriensis', 'lujai', 'lulir', 'madiniella', 'mindoroana', 'minshanica',
        'minutoplia', 'miotemna', 'modestula', 'nagana', 'nangana', 'narya', 'nathani', 'neoserica',
        'niasica', 'niijima', 'nilotica', 'nipponica', 'noscitata', 'olingan', 'opacithorax', 'ptagon',
        'pto', 'ptodos', 'ptun', 'ramilia', 'samarana', 'sapitana', 'satrapa', 'scaphia', 'takagii',
        'tephraeoserica',
        'xanthocerus', 'xenaclopus', 'xichangensis',
        'qaumihi', 'qaumiyyah', 'qinlingshanica', 'qiyamuhu', 'qiyas', 'qodrat', 'qomar', 'qomariah',
        'quadratigera', 'quadriflavomaculatus', 'quadrilamellata', 'quadripustulata', 'qudsy', 'qudum',
        'qudus', 'que', 'queinine', 'quem', 'quercetum', 'quid', 'quinqueflabellata', 'quinquelamellata',
        'quinquidens', 'quisqualis', 'qul', 'quod', 'qur', 'quratea', 'qurb', 'qurun', 'quwwata',
        'yaeyamana', 'yahu', 'yakushimana', 'yamur', 'yandra', 'yanti', 'yaogiensis', 'yaumur',
        'yasutoshii', 'ylbhi', 'ylki', 'yme', 'yoboi', 'yonaguniensis', 'ypac', 'ypoc', 'ypsilon',
        'ysh', 'yulongshanica', 'yunida', 'yunir', 'yunita', 'yupi', 'yuslihu',
        'vagus', 'validipes', 'valorem', 'vanil', 'vanno', 'vansoni', 'vardhana', 'variicollis',
        'variicornis', 'vario', 'varrio', 'varsitas', 'vbac', 'vco', 'vedaniya', 'velamentosa',
        'velcro', 'velia', 'vellum', 'veloce', 'velote', 'venereal', 'veramani', 'verreauxi',
        'vespertina', 'viable', 'viably', 'viaduct', 'vialed', 'viaticum', 'vici', 'vicious', 'vidi',
        'vidya', 'viettei', 'vignai', 'vili', 'vinaya', 'vinces', 'vini', 'vioana', 'violence', 'vira',
        'viralitas', 'viridifrons', 'visite', 'vitaminasi', 'vitro', 'vivant', 'vivat', 'viveka',
        'vivere', 'vivo', 'vksk', 'vogue', 'voiture', 'volant', 'volatif', 'volte', 'voluntir',
        'volux', 'vostro', 'vox', 'vpn',
      ],
    },
  },
  {
    version: '1.1.1',
    date: '19 Agu 2026',
    changes: [
      'Ada jendela baru "Update Log" buat lihat apa aja yang berubah di tiap update',
      'Jendela ini bakal muncul sendiri sekali kalau ada update baru',
      'Mau lihat lagi kapan aja? Buka Pengaturan → Tentang → Lihat Update Log',
      'Data kamu (kata yang udah dipush, grup trap, dll) sekarang otomatis ke-backup ke server (jika ingin backup manual pun tetap bisa).',
      'Riwayat backup bisa dicek di menu akun → Riwayat Backup, dan tiap backup ada tombol "Restore" buat balikin data ke kondisi saat itu',
    ],
  },
];

function getMajorMinor(version) {
  return String(version).split('.').slice(0, 2).join('.');
}

// Kamus dikirim dalam bentuk ter-obfuscate (character-shift dengan wraparound),
// bukan JSON polos, biar ga trivial dibaca langsung dari tab Network.
// Kunci & rentang ini HARUS sama persis dengan yang dipakai pas nge-encode filenya.
const ASSET_SHIFT = 37;
const ASSET_RANGE_START = 32;
const ASSET_RANGE_SIZE = 95; // printable ASCII 32-126

function decodeAssetText(str) {
  const n = str.length;
  const codes = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    let code = str.charCodeAt(i);
    if (code >= ASSET_RANGE_START && code < ASSET_RANGE_START + ASSET_RANGE_SIZE) {
      code = ((code - ASSET_RANGE_START - ASSET_SHIFT) % ASSET_RANGE_SIZE + ASSET_RANGE_SIZE) % ASSET_RANGE_SIZE + ASSET_RANGE_START;
    }
    codes[i] = code;
  }
  let out = '';
  const chunk = 8192;
  for (let i = 0; i < n; i += chunk) {
    out += String.fromCharCode.apply(null, codes.subarray(i, i + chunk));
  }
  return out;
}

async function loadDefaultDictionary() {
  const cacheKey = 'samkat_dict_cache_' + DICTIONARY_VERSION;

  // Coba pake cache lokal dulu kalau ada & versinya cocok -- biar gak perlu
  // fetch + decode ulang teks assets.txt (200rb+ kata) tiap kali buka web.
  // Cache ini otomatis basi/gak kepake lagi begitu DICTIONARY_VERSION naik
  // (key-nya ikut berubah), jadi selalu sinkron sama rilis kamus terbaru.
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const words = JSON.parse(cached);
      if (Array.isArray(words) && words.length) {
        DICTIONARY = words;
        baseDictSet = new Set(words);
        rebuildCaches();
        return;
      }
    }
  } catch (e) { }

  try {
    const res = await fetch(AUTH_API_BASE + '/dictionary?v=' + DICTIONARY_VERSION);
    if (!res.ok) throw new Error('fetch gagal: ' + res.status);
    const encodedText = await res.text();
    const words = JSON.parse(decodeAssetText(encodedText));
    if (Array.isArray(words) && words.length) {
      DICTIONARY = words;
      baseDictSet = new Set(words);
      rebuildCaches();
      try {
        localStorage.setItem(cacheKey, JSON.stringify(words));
        // Buang cache versi lama biar localStorage gak numpuk-numpuk kepake
        // duplikat kamus lama yang udah gak relevan.
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith('samkat_dict_cache_') && k !== cacheKey) localStorage.removeItem(k);
        }
      } catch (e) { } // localStorage penuh/diblokir -- gapapa, tinggal gak ke-cache aja
    }
  } catch (e) {
    console.warn('Gagal load data/assets.txt, pake fallback kecil.', e);
  }
}

async function storageGet(key) {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v;
  } catch (e) { }
  return null;
}
async function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    showToast('⚠️ gagal nyimpen, browser lu blokir storage');
    return false;
  }
}

async function loadStorage() {
  const t = await storageGet('samkat_theme');
  if (t) applyTheme(t);
  const f = await storageGet('samkat_favorites');
  if (f) { try { favorites = JSON.parse(f); } catch (e) { } }
  const b = await storageGet('samkat_blocked');
  if (b) { try { blocked = JSON.parse(b); } catch (e) { } }

  // migrasi 1x dari sistem lama: snapshot kamus penuh di localStorage.
  // kata yang ada di snapshot lama tapi ga ada di dictionary.json terbaru
  // dianggap kata tambahan pribadi, diselamatin ke customWords.
  const oldFull = await storageGet('samkat_dictionary');
  if (oldFull) {
    try {
      const parsedOld = JSON.parse(oldFull);
      if (Array.isArray(parsedOld)) {
        const migrated = parsedOld.filter(w => !dictSet.has(w));
        if (migrated.length) customWords = Array.from(new Set([...customWords, ...migrated]));
      }
    } catch (e) { }
    localStorage.removeItem('samkat_dictionary');
  }

  const cw = await storageGet('samkat_custom_words');
  if (cw) {
    try {
      const parsedCw = JSON.parse(cw);
      if (Array.isArray(parsedCw)) customWords = Array.from(new Set([...customWords, ...parsedCw]));
    } catch (e) { }
  }

  // buang kata custom yang ternyata udah masuk kamus resmi (jadi ga perlu label "kata kustom" lagi)
  const customWordsBefore = customWords.length;
  customWords = customWords.filter(w => !baseDictSet.has(w));
  if (customWords.length !== customWordsBefore) {
    rebuildCaches();
  }

  // buang kata custom yang ternyata sudah diblokir juga (custom word yang di-blokir dianggap invalid total)
  const customWordsBeforeBlocked = customWords.length;
  customWords = customWords.filter(w => !blockedSet.has(w));
  if (customWords.length !== customWordsBeforeBlocked) {
    rebuildCaches();
  }

  if (customWords.length) {
    DICTIONARY = Array.from(new Set([...DICTIONARY, ...customWords])).sort();
  }
  rebuildCaches();

  // buang kata blocked yang udah ga ada lagi di dictionary (misal abis update kamus)
  const blockedBefore = blocked.length;
  blocked = blocked.filter(w => dictSet.has(w));
  blockedSet = new Set(blocked);
  // simpen lokal doang di sini (TANPA network sync) -- pullFromServer() yang
  // jalan abis ini bakal narik data resmi dari server, jadi push di titik ini
  // cuma buang-buang request & berisiko nimpa data server pake data lokal basi.
  if (blocked.length !== blockedBefore) {
    await storageSet('samkat_blocked', JSON.stringify(blocked));
  }
  await storageSet('samkat_custom_words', JSON.stringify(customWords));
  render();
}
async function saveFavorites() { await storageSet('samkat_favorites', JSON.stringify(favorites)); }
async function saveBlocked() {
  await storageSet('samkat_blocked', JSON.stringify(blocked));
  debouncedSync();
}
async function saveTheme(v) { await storageSet('samkat_theme', v); }
async function saveCustomWords() {
  await storageSet('samkat_custom_words', JSON.stringify(customWords));
  debouncedSync();
}
function stripKompeGroup(g) {
  return { id: g.id, segment: g.segment, weight: g.weight, mode: g.mode };
}

function stripKompePresetsForStorage(presets) {
  return {
    normal: presets.normal.map(p => ({ id: p.id, name: p.name, groups: p.groups.map(stripKompeGroup) })),
    brutal: presets.brutal.map(p => ({ id: p.id, name: p.name, groups: p.groups.map(stripKompeGroup) })),
  };
}

function hydrateKompePresets(stripped) {
  const hydrateMode = (list, fallbackMode) => (Array.isArray(list) ? list : []).map(p => ({
    id: p.id,
    name: typeof p.name === 'string' && p.name.trim() ? p.name : 'Preset',
    groups: (Array.isArray(p.groups) ? p.groups : []).map(g => {
      const group = computeKompeGroup(g.segment, g.weight, g.mode || fallbackMode);
      if (group) group.id = g.id;
      return group;
    }).filter(Boolean),
  }));
  return {
    normal: hydrateMode(stripped && stripped.normal, 'normal'),
    brutal: hydrateMode(stripped && stripped.brutal, 'brutal'),
  };
}

function makeKompePresetId() {
  return 'p' + Date.now() + Math.random().toString(36).slice(2, 6);
}

function makeKompeGroupId() {
  return 'g' + Date.now() + Math.random().toString(36).slice(2, 6);
}

// Bungkus kompeGroups flat lama jadi Preset 1, dipisah per mode. Dipake pas
// migrasi pertama kali & pas restore backup lama yang formatnya masih flat.
function migrateFlatKompeGroupsToPresets(flatGroups) {
  const normalGroups = flatGroups.filter(g => g.mode !== 'brutal');
  const brutalGroups = flatGroups.filter(g => g.mode === 'brutal');
  return {
    normal: [{ id: makeKompePresetId(), name: 'Preset 1', groups: normalGroups }],
    brutal: [{ id: makeKompePresetId(), name: 'Preset 1', groups: brutalGroups }],
  };
}

// Preset gak boleh kosong total per mode -- minimal harus ada 1 (boleh isinya kosong).
function ensureDefaultKompePresets() {
  ['normal', 'brutal'].forEach(m => {
    if (!kompePresets[m].length) {
      kompePresets[m].push({ id: makeKompePresetId(), name: 'Preset 1', groups: [] });
    }
    if (!kompePresets[m].some(p => p.id === kompeActivePresetId[m])) {
      kompeActivePresetId[m] = kompePresets[m][0].id;
    }
  });
}

// Klik pertama kali pada sebuah grup -> masuk ke paling bawah daftar pin
// (jadi prioritas paling akhir yang di-set, tapi tetap di atas semua grup
// yang belum pernah di-klik). Klik lagi pada grup yang udah ke-pin -> lepas
// dari daftar pin, balik ke sortir berdasarkan weight.
function toggleKompeGroupPriority(id) {
  const idx = kompePinnedGroupIds.indexOf(id);
  if (idx !== -1) {
    kompePinnedGroupIds.splice(idx, 1);
  } else {
    kompePinnedGroupIds.push(id);
  }
}

// Dipake bareng renderKompeGroupList & computeKompeTriggerRows biar dua-duanya
// konsisten: grup yang ke-pin selalu di atas (urutan sesuai kapan di-klik),
// sisanya di bawah diurut weight terbesar -> terkecil.
function sortKompeGroupsByPriority(groups, getId, getWeight, getSegment) {
  const pinnedRank = new Map(kompePinnedGroupIds.map((id, i) => [id, i]));
  return [...groups].sort((a, b) => {
    const aPin = pinnedRank.has(getId(a));
    const bPin = pinnedRank.has(getId(b));
    if (aPin && bPin) return pinnedRank.get(getId(a)) - pinnedRank.get(getId(b));
    if (aPin) return -1;
    if (bPin) return 1;
    return getWeight(b) - getWeight(a) || getSegment(a).localeCompare(getSegment(b));
  });
}

function getActiveKompePreset(mode) {
  return kompePresets[mode].find(p => p.id === kompeActivePresetId[mode]) || kompePresets[mode][0];
}

// Bangun ulang "jendela" kompeGroups dari grup preset aktif kedua mode.
function rebuildKompeGroupsUnion() {
  const normalPreset = getActiveKompePreset('normal');
  const brutalPreset = getActiveKompePreset('brutal');
  kompeGroups = [...(normalPreset ? normalPreset.groups : []), ...(brutalPreset ? brutalPreset.groups : [])];
}

// Kebalikannya: tulis balik isi kompeGroups (yang barusan dimutasi kode lama)
// ke grup preset aktif masing-masing mode.
function syncKompeGroupsToActivePresets() {
  const normalPreset = getActiveKompePreset('normal');
  const brutalPreset = getActiveKompePreset('brutal');
  if (normalPreset) normalPreset.groups = kompeGroups.filter(g => g.mode !== 'brutal');
  if (brutalPreset) brutalPreset.groups = kompeGroups.filter(g => g.mode === 'brutal');
}

async function saveKompeGroups() {
  syncKompeGroupsToActivePresets();
  await storageSet('samkat_kompe_presets', JSON.stringify(stripKompePresetsForStorage(kompePresets)));
  await storageSet('samkat_kompe_active_preset', JSON.stringify(kompeActivePresetId));
  // Data lokal (localStorage) udah aman ke-simpen di atas -- itu yang dipake
  // pas app dibuka lagi. Sync ke server sengaja GAK di-await di sini biar UI
  // gak nunggu round-trip network (ini yang bikin nambah grup kerasa lag).
  // Tetep langsung dipanggil (bukan debouncedSync) -- perubahan grup itu aksi
  // sekali klik, bukan event beruntun, dan kalau di-debounce, refresh cepet
  // abis ubah grup bisa ke-pull data lama dari server & nimpa balik perubahan
  // lokal.
  syncPushedWordsToServer();
}

// Persist urutan/nama preset doang (gak nyentuh isi grup) -- dipake abis
// rename/reorder/duplicate/hapus preset, tanpa nyeret sync grup yang gaperlu.
async function saveKompePresetsMeta() {
  await storageSet('samkat_kompe_presets', JSON.stringify(stripKompePresetsForStorage(kompePresets)));
  await storageSet('samkat_kompe_active_preset', JSON.stringify(kompeActivePresetId));
  // Sama kayak saveKompeGroups(): sync gak di-await biar UI gak ketunda nunggu
  // network. Tetep langsung dipanggil (bukan debouncedSync) biar gak ke-pull-
  // timpa data lama pas user refresh cepet abis bikin/hapus preset.
  syncPushedWordsToServer();
}

async function loadKompeGroups() {
  const rawPresets = await storageGet('samkat_kompe_presets');
  let migrated = false;
  if (rawPresets) {
    try {
      kompePresets = hydrateKompePresets(JSON.parse(rawPresets));
    } catch (e) {
      kompePresets = { normal: [], brutal: [] };
    }
  } else {
    // belum pernah punya data preset -- migrasi dari key lama (flat), kalau ada
    const rawFlat = await storageGet('samkat_kompe_groups');
    if (rawFlat) {
      try {
        const stripped = JSON.parse(rawFlat);
        const flatGroups = stripped.map(g => {
          const group = computeKompeGroup(g.segment, g.weight, g.mode);
          if (group) group.id = g.id;
          return group;
        }).filter(Boolean);
        kompePresets = migrateFlatKompeGroupsToPresets(flatGroups);
        migrated = true;
      } catch (e) {
        kompePresets = { normal: [], brutal: [] };
      }
    } else {
      kompePresets = { normal: [], brutal: [] };
    }
  }

  const rawActive = await storageGet('samkat_kompe_active_preset');
  if (rawActive) {
    try { kompeActivePresetId = JSON.parse(rawActive); } catch (e) { }
  }

  ensureDefaultKompePresets();
  rebuildKompeGroupsUnion();

  if (migrated) await saveKompeGroups();
}

function applyTheme(v) {
  document.body.setAttribute('data-theme', v);
  document.getElementById('themeToggle').textContent = v === 'dark' ? '🌙' : '☀️';
}
document.getElementById('themeToggle').addEventListener('click', () => {
  const cur = document.body.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  saveTheme(next);
});

let accentColor = 'biru';
let bgMode = 'default';
let fontFamily = 'serif-source-serif-4';

// Daftar font bawaan, dikelompokin per tipe biar gampang di-scan pas milih.
// Minimal 5 opsi per kategori (khususnya Sans Serif) dan semuanya font yang
// gampang dibaca. "family" udah termasuk fallback generic-nya.
const FONT_LIBRARY = [
  { id: 'serif-source-serif-4', name: 'Source Serif 4', type: 'Serif', family: "'Source Serif 4', serif" },
  { id: 'serif-merriweather', name: 'Merriweather', type: 'Serif', family: "'Merriweather', serif" },
  { id: 'serif-playfair-display', name: 'Playfair Display', type: 'Serif', family: "'Playfair Display', serif" },
  { id: 'serif-lora', name: 'Lora', type: 'Serif', family: "'Lora', serif" },
  { id: 'serif-pt-serif', name: 'PT Serif', type: 'Serif', family: "'PT Serif', serif" },

  { id: 'sans-inter', name: 'Inter', type: 'Sans Serif', family: "'Inter', sans-serif" },
  { id: 'sans-arial', name: 'Arial', type: 'Sans Serif', family: "Arial, Helvetica, sans-serif" },
  { id: 'sans-montserrat', name: 'Montserrat', type: 'Sans Serif', family: "'Montserrat', sans-serif" },
  { id: 'sans-poppins', name: 'Poppins', type: 'Sans Serif', family: "'Poppins', sans-serif" },
  { id: 'sans-roboto', name: 'Roboto', type: 'Sans Serif', family: "'Roboto', sans-serif" },
  { id: 'sans-nunito', name: 'Nunito', type: 'Sans Serif', family: "'Nunito', sans-serif" },

  { id: 'mono-jetbrains-mono', name: 'JetBrains Mono', type: 'Monospace', family: "'JetBrains Mono', monospace" },
  { id: 'mono-roboto-mono', name: 'Roboto Mono', type: 'Monospace', family: "'Roboto Mono', monospace" },
  { id: 'mono-space-mono', name: 'Space Mono', type: 'Monospace', family: "'Space Mono', monospace" },
  { id: 'mono-fira-code', name: 'Fira Code', type: 'Monospace', family: "'Fira Code', monospace" },
  { id: 'mono-courier-new', name: 'Courier New', type: 'Monospace', family: "'Courier New', Courier, monospace" },

  { id: 'rounded-baloo-2', name: 'Baloo 2', type: 'Rounded', family: "'Baloo 2', sans-serif" },
  { id: 'rounded-quicksand', name: 'Quicksand', type: 'Rounded', family: "'Quicksand', sans-serif" },
  { id: 'rounded-comfortaa', name: 'Comfortaa', type: 'Rounded', family: "'Comfortaa', sans-serif" },
  { id: 'rounded-varela-round', name: 'Varela Round', type: 'Rounded', family: "'Varela Round', sans-serif" },
  { id: 'rounded-fredoka', name: 'Fredoka', type: 'Rounded', family: "'Fredoka', sans-serif" },
];
const FONT_GROUP_ORDER = ['Serif', 'Sans Serif', 'Monospace', 'Rounded'];
// Value lama sebelum ada picker baru, biar setting user lama gak reset.
const LEGACY_FONT_MAP = {
  serif: 'serif-source-serif-4',
  sans: 'sans-inter',
  mono: 'mono-jetbrains-mono',
  rounded: 'rounded-baloo-2',
};

function resolveFontFamily(value) {
  if (typeof value !== 'string' || !value) value = 'serif-source-serif-4';
  if (LEGACY_FONT_MAP[value]) value = LEGACY_FONT_MAP[value];
  if (value.indexOf('custom:') === 0) {
    const name = value.slice(7).trim();
    if (name) return { id: value, name, type: 'Custom', family: `'${name}', sans-serif`, custom: true };
  }
  return FONT_LIBRARY.find(f => f.id === value) || FONT_LIBRARY[0];
}

const _loadedGoogleFonts = new Set();
function injectGoogleFont(name) {
  const key = name.trim().toLowerCase();
  if (!key || _loadedGoogleFonts.has(key)) return;
  _loadedGoogleFonts.add(key);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name.trim()).replace(/%20/g, '+')}:wght@400;500;600;700&display=swap`;
  document.head.appendChild(link);
}

// Ngecek beneran apa nama font custom itu ada di Google Fonts atau ngga.
// Caranya: pasang <link> stylesheet-nya, tunggu link itu selesai dimuat,
// terus suruh browser beneran nge-load font-nya lewat document.fonts.load().
// Kalau nama font-nya salah/ga ada, Google balikin response tanpa
// @font-face yang valid, jadi document.fonts ga bakal punya font itu sama
// sekali -> ketauan "not found"-nya dari situ, bukan cuma nebak.
async function checkGoogleFontAvailability(name) {
  const formatted = name.trim();
  const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(formatted).replace(/%20/g, '+')}:wght@400;500;600;700&display=swap`;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  const linkSettled = new Promise(resolve => {
    let done = false;
    link.addEventListener('load', () => { done = true; resolve(); });
    link.addEventListener('error', () => { done = true; resolve(); });
    setTimeout(() => { if (!done) resolve(); }, 2500);
  });
  document.head.appendChild(link);
  await linkSettled;

  let available = false;
  try {
    const faces = await document.fonts.load(`400 16px "${formatted}"`);
    available = Array.isArray(faces) && faces.length > 0;
  } catch (e) { available = false; }
  if (!available) {
    try { available = document.fonts.check(`400 16px "${formatted}"`); } catch (e) { }
  }

  if (available) {
    _loadedGoogleFonts.add(formatted.toLowerCase());
  } else {
    link.remove();
  }
  return available;
}

function setCustomFontStatus(text, state) {
  const el = document.getElementById('customFontStatus');
  if (!el) return;
  el.textContent = text;
  el.className = 'font-picker-custom-status' + (state ? ' ' + state : '');
}

async function handleCustomFontApply() {
  const input = document.getElementById('customFontInput');
  const btn = document.getElementById('customFontApplyBtn');
  const val = input ? input.value.trim() : '';
  if (!val) return;
  btn.disabled = true;
  setCustomFontStatus('Ngecek ke Google Fonts...', 'checking');
  const ok = await checkGoogleFontAvailability(val);
  btn.disabled = false;
  if (!ok) {
    setCustomFontStatus(`✕ "${val}" gak ketemu di Google Fonts. Cek lagi ejaannya.`, 'not-found');
    return;
  }
  setCustomFontStatus(`✓ "${val}" ketemu, dipakai sekarang`, 'found');
  fontFamily = 'custom:' + val;
  applyAppearance();
  saveAppearance();
  setTimeout(closeFontPicker, 900);
}

function renderFontPickerDropdown() {
  const dropdown = document.getElementById('fontPickerDropdown');
  if (!dropdown) return;
  let html = '';
  FONT_GROUP_ORDER.forEach(type => {
    const opts = FONT_LIBRARY.filter(f => f.type === type);
    if (!opts.length) return;
    html += `<div class="font-picker-group"><div class="font-picker-group-label">${type}</div>`;
    opts.forEach(f => {
      html += `<button type="button" class="font-picker-option" data-font-id="${f.id}">
        <span class="font-picker-option-name" style="font-family:${f.family};">${f.name}</span>
        <span class="font-picker-option-type">${f.type}</span>
      </button>`;
    });
    html += `</div>`;
  });
  html += `<div class="font-picker-group font-picker-custom-group">
    <div class="font-picker-group-label">Font Custom</div>
    <div class="font-picker-custom-row">
      <input type="text" id="customFontInput" placeholder="nama font Google Fonts, mis. Roboto Slab">
      <button type="button" id="customFontApplyBtn">Pakai</button>
    </div>
    <p class="font-picker-custom-hint">Ketik nama font apa aja yang ada di Google Fonts, nanti otomatis dicek &amp; di-import.</p>
    <p class="font-picker-custom-status" id="customFontStatus"></p>
  </div>`;
  dropdown.innerHTML = html;
}
renderFontPickerDropdown();

function updateFontPickerUI(fontObj) {
  const triggerName = document.getElementById('fontPickerTriggerName');
  const triggerType = document.getElementById('fontPickerTriggerType');
  if (triggerName) {
    triggerName.textContent = fontObj.name;
    triggerName.style.fontFamily = fontObj.family;
  }
  if (triggerType) triggerType.textContent = fontObj.type;
  document.querySelectorAll('#fontPickerDropdown .font-picker-option').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-font-id') === fontObj.id);
  });
}

function closeFontPicker() {
  const picker = document.getElementById('fontPicker');
  if (picker) picker.classList.remove('open');
}

const fontPickerEl = document.getElementById('fontPicker');
const fontPickerTriggerBtn = document.getElementById('fontPickerTrigger');
if (fontPickerTriggerBtn) {
  fontPickerTriggerBtn.addEventListener('click', e => {
    e.stopPropagation();
    fontPickerEl.classList.toggle('open');
  });
}
document.addEventListener('click', e => {
  if (fontPickerEl && !fontPickerEl.contains(e.target)) closeFontPicker();
});
document.getElementById('fontPickerDropdown').addEventListener('click', e => {
  const optBtn = e.target.closest('.font-picker-option');
  if (optBtn) {
    fontFamily = optBtn.getAttribute('data-font-id');
    applyAppearance();
    saveAppearance();
    closeFontPicker();
    return;
  }
  if (e.target.id === 'customFontApplyBtn') {
    handleCustomFontApply();
  }
});
document.getElementById('fontPickerDropdown').addEventListener('input', e => {
  if (e.target.id === 'customFontInput') setCustomFontStatus('', '');
});
document.getElementById('fontPickerDropdown').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'customFontInput') {
    e.preventDefault();
    handleCustomFontApply();
  }
});
document.getElementById('fontPickerDropdown').addEventListener('click', e => e.stopPropagation());

function applyAppearance() {
  document.body.setAttribute('data-accent', accentColor);
  document.body.setAttribute('data-bgmode', bgMode);
  const fontObj = resolveFontFamily(fontFamily);
  if (fontObj.custom) injectGoogleFont(fontObj.name);
  document.body.style.setProperty('--font-word', fontObj.family);
  updateFontPickerUI(fontObj);
  const accentSelect = document.getElementById('accentColorSelect');
  const bgSelect = document.getElementById('bgModeSelect');
  setCustomSelectValue(accentSelect, accentColor, false);
  setCustomSelectValue(bgSelect, bgMode, false);
}
async function saveAppearance() {
  await storageSet('samkat_accent', accentColor);
  await storageSet('samkat_bgmode', bgMode);
  await storageSet('samkat_font', fontFamily);
  debouncedSync();
}
async function loadAppearance() {
  const a = await storageGet('samkat_accent');
  if (a) accentColor = a;
  const bm = await storageGet('samkat_bgmode');
  if (bm) bgMode = bm;
  const ff = await storageGet('samkat_font');
  if (ff) fontFamily = resolveFontFamily(ff).id;
  applyAppearance();
}
document.getElementById('accentColorSelect').addEventListener('change', e => {
  accentColor = e.target.value;
  applyAppearance();
  saveAppearance();
});
document.getElementById('bgModeSelect').addEventListener('change', e => {
  bgMode = e.target.value;
  applyAppearance();
  saveAppearance();
});

let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// ---- util: debounce (dipake buat kompe search & kompe modal preview) ----
function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

const RENDER_STEP = 300;
let renderLimit = RENDER_STEP;
let lastFiltered = [];

function renderInputRow() {
  const row = document.getElementById('inputRow');
  row.innerHTML = '';
  if (mode === 'both') {
    row.innerHTML = `
      <div class="input-wrap">
        <span class="prefix-label">awl</span>
        <input type="text" id="inputAwalan" autocomplete="off" placeholder="Awalan" value="${escapeHtml(query.awalan)}">
        <button type="button" class="input-clear-btn" data-clear-for="inputAwalan" tabindex="-1">✕</button>
      </div>
      <div class="input-wrap">
        <span class="prefix-label">akh</span>
        <input type="text" id="inputAkhiran" autocomplete="off" placeholder="Akhiran" value="${escapeHtml(query.akhiran)}">
        <button type="button" class="input-clear-btn" data-clear-for="inputAkhiran" tabindex="-1">✕</button>
      </div>
    `;
  } else if (mode === 'awalan') {
    row.innerHTML = `
      <div class="input-wrap">
        <input type="text" id="inputAwalan" autocomplete="off" placeholder="ketik awalan kata..." value="${escapeHtml(query.awalan)}">
        <button type="button" class="input-clear-btn" data-clear-for="inputAwalan" tabindex="-1">✕</button>
      </div>
      <button class="go-btn" id="goBtn">→</button>
    `;
  } else if (mode === 'mengandung') {
    row.innerHTML = `
      <div class="input-wrap">
        <input type="text" id="inputMengandung" autocomplete="off" placeholder="ketik kata yang dicari..." value="${escapeHtml(query.mengandung)}">
        <button type="button" class="input-clear-btn" data-clear-for="inputMengandung" tabindex="-1">✕</button>
      </div>
      <button class="go-btn" id="goBtn">→</button>
    `;
  } else {
    row.innerHTML = `
      <div class="input-wrap">
        <input type="text" id="inputAkhiran" autocomplete="off" placeholder="ketik akhiran kata..." value="${escapeHtml(query.akhiran)}">
        <button type="button" class="input-clear-btn" data-clear-for="inputAkhiran" tabindex="-1">✕</button>
      </div>
      <button class="go-btn" id="goBtn">→</button>
    `;
  }
  const ia = document.getElementById('inputAwalan');
  const ik = document.getElementById('inputAkhiran');
  const im = document.getElementById('inputMengandung');
  const debouncedMainSearch = debounce(() => { renderLimit = RENDER_STEP; render(); }, 120);
  if (ia) ia.addEventListener('input', e => { query.awalan = e.target.value.toLowerCase(); debouncedMainSearch(); });
  if (ik) ik.addEventListener('input', e => { query.akhiran = e.target.value.toLowerCase(); debouncedMainSearch(); });
  if (im) im.addEventListener('input', e => { query.mengandung = e.target.value.toLowerCase(); debouncedMainSearch(); });
  setupClearButtons(row);
  const go = document.getElementById('goBtn');
  if (go) go.addEventListener('click', () => (ia || ik || im).blur());
  if (ia) setTimeout(() => { ia.focus(); ia.setSelectionRange(ia.value.length, ia.value.length); }, 0);
  if (im) setTimeout(() => { im.focus(); im.setSelectionRange(im.value.length, im.value.length); }, 0);
}

document.querySelectorAll('#filterSegment button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#filterSegment button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    mode = btn.dataset.mode;
    query = { awalan: "", akhiran: "", mengandung: "" };
    renderLimit = RENDER_STEP;
    renderInputRow();
    render();
  });
});

const PUSH_LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
let activeTab = 'pencarian';
let selectedStart = null;
let selectedEnd = null;
let pushedWords = [];
// pushUndoStack sekarang nyimpen ARRAY OF BATCH, tiap elemen berbentuk
// { type: 'push' | 'block' | 'customDelete', words: [...] } -- bukan array of
// kata polos lagi. `type` nentuin cara undo-nya:
//   - 'push'         -> keluarin kata2 itu lagi dari pushedWords
//   - 'block'        -> keluarin kata2 itu lagi dari daftar blocked
//   - 'customDelete' -> balikin kata2 itu ke daftar kata kustom (+ dictionary)
// Push 1 kata/blokir 1 kata manual = batch isi 1 kata. Push Semua / Pilih
// Rentang = batch isi banyak kata sekaligus. Undo selalu pop 1 batch paling
// atas dan balikin SEMUA kata di batch itu sesuai type-nya -- 1 tombol Undo
// yang sama, otomatis ngerti aksi apa yang barusan kejadian.
let pushUndoStack = [];
const PUSH_UNDO_LIMIT = 10;
const CHECK_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 13 10 18 19 7"></polyline></svg>';
const COPY_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';

async function copyWordToClipboard(word) {
  try {
    await navigator.clipboard.writeText(word);
    showToast(`📋 "${word}" disalin`);
  } catch (e) {
    showToast('⚠️ gagal nyalin kata');
  }
}
let pushViewMode = 'list';
let pushSortMode = 'az';

// ---- Mode "Pilih Rentang" ----
// pushRangeLo/Hi itu INDEX di lastPushSorted (list hasil filter+sort yang lagi
// ketampil), bukan kata langsung -- biar gampang dihitung ulang "handle
// terdekat" pas tap ketiga dst. Reset otomatis tiap kali filter/sort berubah
// (lihat resetPushRangeState) biar index-nya gak pernah nunjuk ke urutan basi.
let pushRangeMode = false;
let pushRangeLo = null;
let pushRangeHi = null;
// Cursor "kata yang lagi dipilih" buat navigasi ↑/↓ + Enter (push) + Backspace
// (blokir). Index ini nunjuk ke posisi di lastPushSorted (list hasil
// filter+sort yang lagi aktif). Defaultnya null -- artinya BELUM ada kata
// yang kepilih sampe user beneran mencet ↑/↓. Jangan diubah balik ke 0,
// soalnya itu bikin kata paling atas keanggep "dipilih" dari awal (padahal
// belum dipencet apa-apa) dan renderPushIndex() bakal maksa scrollIntoView
// ke situ tiap kali render ulang -- kerasa kayak "auto-scroll ke hover" pas
// discroll manual di mobile. Biarin Enter/Backspace nunjuk ke `undefined`
// selama cursor masih null; itu udah ke-handle lewat pengecekan `if (!word)`.
let pushCursorIndex = null;

function resetPushRangeState() {
  pushRangeMode = false;
  pushRangeLo = null;
  pushRangeHi = null;
  // Cursor navigasi kata (↑/↓) ikut direset tiap kali filter/sort berubah --
  // fungsi ini kepanggil persis di semua titik itu, jadi digabung di sini
  // biar gak perlu nambah baris manual di tiap tempat yang manggil. Direset
  // ke null (bukan 0) biar gak ada kata yang otomatis "kepilih" lagi.
  pushCursorIndex = null;
  const toggleBtn = document.getElementById('pushRangeToggleBtn');
  const infoBar = document.getElementById('pushRangeInfo');
  if (toggleBtn) toggleBtn.classList.remove('active');
  if (infoBar) infoBar.style.display = 'none';
}

// Dipake bareng oleh Push Semua & Pilih Rentang -- 1 kali save, bukan
// looping savePushedWords() per kata (berat kalau jumlahnya ratusan).
async function pushWordsBatch(words) {
  const toPush = words.filter(w => !isPushed(w));
  if (toPush.length === 0) return 0;
  pushedWords.push(...toPush);
  pushedSet = new Set(pushedWords);
  pushUndoStack.push({ type: 'push', words: toPush });
  if (pushUndoStack.length > PUSH_UNDO_LIMIT) pushUndoStack.shift();
  letterStats = null;
  updatePushUndoBtn();
  await savePushedWords();
  return toPush.length;
}
let pushRandomSnapshot = null;

async function loadPushedWords() {
  const p = await storageGet('samkat_pushed_words');
  if (p) { try { pushedWords = JSON.parse(p); } catch (e) { } }
  rebuildCaches();
  pruneStalePushedWords();
  renderPushIndex();
}
async function savePushedWords() {
  await storageSet('samkat_pushed_words', JSON.stringify(pushedWords));
  debouncedSync();
}
let dictSet = new Set(DICTIONARY);
let pushedSet = new Set(pushedWords);
let blockedSet = new Set(blocked);
let letterStats = null;
const PUSH_RENDER_STEP = 300;
let pushRenderLimit = PUSH_RENDER_STEP;
let lastPushSorted = [];
const MAX_KOMPE_RENDER = 100;

// Index kata per huruf pertama & huruf terakhir, biar filter awalan/akhiran
// gak perlu scan seluruh 200rb+ kata tiap keystroke -- tinggal ambil bucket
// huruf yang relevan dulu (jauh lebih kecil), baru startsWith/endsWith
// dijalanin di situ. Di-rebuild tiap kali DICTIONARY berubah (rebuildCaches).
let dictByFirstLetter = new Map();
let dictByLastLetter = new Map();
function rebuildLetterIndex() {
  dictByFirstLetter = new Map();
  dictByLastLetter = new Map();
  for (const w of DICTIONARY) {
    if (!w) continue;
    const first = w[0];
    const last = w[w.length - 1];
    if (!dictByFirstLetter.has(first)) dictByFirstLetter.set(first, []);
    dictByFirstLetter.get(first).push(w);
    if (!dictByLastLetter.has(last)) dictByLastLetter.set(last, []);
    dictByLastLetter.get(last).push(w);
  }
}

function rebuildCaches() {
  dictSet = new Set(DICTIONARY);
  customWordsSet = new Set(customWords);
  pushedSet = new Set(pushedWords);
  blockedSet = new Set(blocked);
  favoritesSet = new Set(favorites);
  letterStats = null;
  trapFreqCache = {};
  rebuildLetterIndex();
  const badge = document.getElementById('customWordsCount');
  if (badge) badge.textContent = customWords.length;
  scheduleKompeTrapFreqWarmup();
}
function isPushed(word) { return pushedSet.has(word); }
function isCustomWord(word) { return customWordsSet.has(word) && !baseDictSet.has(word); }
function percent(done, total) { return total ? Math.floor((done / total) * 100) : 0; }
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function rebuildLetterStats() {
  const total = {}, pushedCount = {};
  PUSH_LETTERS.forEach(a => {
    total[a] = {}; pushedCount[a] = {};
    PUSH_LETTERS.forEach(b => { total[a][b] = 0; pushedCount[a][b] = 0; });
  });
  for (const w of DICTIONARY) {
    if (blockedSet.has(w)) continue;
    const a = w[0], z = w[w.length - 1];
    if (total[a] && total[a][z] !== undefined) {
      total[a][z]++;
      if (pushedSet.has(w)) pushedCount[a][z]++;
    }
  }
  letterStats = { total, pushedCount };
}
function progressForLetter(type, letter) {
  if (!letterStats) rebuildLetterStats();
  const { total, pushedCount } = letterStats;
  const withEmptyCheck = (p, t) => t === 0 ? { pct: 100, empty: true } : { pct: percent(p, t), empty: false };
  if (type === 'start') {
    let t = 0, p = 0;
    PUSH_LETTERS.forEach(b => { t += total[letter][b]; p += pushedCount[letter][b]; });
    return withEmptyCheck(p, t);
  } else {
    if (selectedStart && selectedStart.length === 1) {
      return withEmptyCheck(pushedCount[selectedStart][letter], total[selectedStart][letter]);
    }
    if (selectedStart && selectedStart.length > 1) {
      const words = wordsForIndex(selectedStart, letter);
      return withEmptyCheck(words.filter(isPushed).length, words.length);
    }
    let t = 0, p = 0;
    PUSH_LETTERS.forEach(a => { t += total[a][letter]; p += pushedCount[a][letter]; });
    return withEmptyCheck(p, t);
  }
}
function wordsForIndex(start, end) {
  return DICTIONARY.filter(word =>
    (!start || word.startsWith(start)) &&
    (!end || word.endsWith(end)) &&
    !blockedSet.has(word)
  );
}
function renderLetterGrid(targetId, type, selected) {
  const target = document.getElementById(targetId);
  target.innerHTML = PUSH_LETTERS.map(letter => {
    const { pct, empty } = progressForLetter(type, letter);
    return `<button class="index-card ${selected === letter ? 'active' : ''} ${empty ? 'is-empty' : ''}" data-index-type="${type}" data-letter="${letter}" title="${empty ? '0 kata' : pct + '%'}">
      <span class="index-card-letter">${letter.toUpperCase()}</span>
      <span class="pct">${pct}%</span>
      <span class="index-card-progress" style="width:${pct}%"></span>
    </button>`;
  }).join('');
  target.querySelectorAll('.index-card').forEach(card => {
    card.addEventListener('click', () => {
      const letter = card.dataset.letter;
      if (card.dataset.indexType === 'start') {
        selectedStart = selectedStart === letter ? null : letter;
        document.getElementById('pushAwalanInput').value = selectedStart || '';
      } else {
        selectedEnd = selectedEnd === letter ? null : letter;
        document.getElementById('pushAkhiranInput').value = selectedEnd || '';
      }
      pushRenderLimit = PUSH_RENDER_STEP;
      renderPushIndex();
    });
  });
}
function getPushedInDictCount() {
  return pushedWords.reduce((acc, w) => acc + (dictSet.has(w) ? 1 : 0), 0);
}
// Kata yang pernah dipush tapi udah ga ada lagi di kamus aktif (misal abis
// diblokir sebagai kata custom, atau kamus diganti/import baru) beneran
// dibuang dari pushedWords, bukan cuma disaring pas ditampilkan. Biar
// pushedWords.length selalu sama artinya di manapun dipakai (termasuk data
// yang kesync ke server).
function pruneStalePushedWords(silent) {
  const before = pushedWords.length;
  pushedWords = pushedWords.filter(w => dictSet.has(w));
  if (pushedWords.length === before) return 0;
  pushedSet = new Set(pushedWords);
  savePushedWords();
  const removed = before - pushedWords.length;
  if (!silent) {
    showToast(`🧹 ${removed.toLocaleString('id-ID')} kata terpush yang udah ga ada di kamus dibersihin`);
  }
  return removed;
}
function renderPushIndex() {
  renderLetterGrid('startIndexGrid', 'start', selectedStart);
  renderLetterGrid('endIndexGrid', 'end', selectedEnd);

  const pushedInDict = getPushedInDictCount();
  const globalPercent = percent(pushedInDict, DICTIONARY.length);
  document.getElementById('pushGlobalSummary').innerHTML =
    `<b>${pushedInDict.toLocaleString('id-ID')}</b>/${DICTIONARY.length.toLocaleString('id-ID')} index terpush | ${globalPercent}%`;

  const list = wordsForIndex(selectedStart, selectedEnd);
  const belum = list.length - list.filter(isPushed).length;
  const hasFilter = !!(selectedStart || selectedEnd);

  const countEl = document.getElementById('pushWordCount');
  countEl.innerHTML = hasFilter
    ? `<span class="pw-highlight">${belum.toLocaleString('id-ID')}</span>/${list.length.toLocaleString('id-ID')} <span class="pw-highlight">kata belum di push</span>`
    : 'Pilih awalan atau akhiran';

  const container = document.getElementById('pushWords');
  container.className = 'push-words ' + pushViewMode + (pushRangeMode ? ' range-mode' : '');

  if (!hasFilter) {
    container.innerHTML = '<div class="push-empty">Pilih awalan atau akhiran untuk mulai push index.</div>';
    return;
  }

  let sorted;
  if (pushSortMode === 'random') {
    const key = (selectedStart || '') + '|' + (selectedEnd || '');
    if (!pushRandomSnapshot || pushRandomSnapshot.key !== key) {
      pushRandomSnapshot = { key, order: shuffleArray(list) };
    }
    const listSet = new Set(list);
    sorted = pushRandomSnapshot.order.filter(w => listSet.has(w));
  } else {
    sorted = [...list];
    switch (pushSortMode) {
      case 'az': sorted.sort((a, b) => a.localeCompare(b)); break;
      case 'za': sorted.sort((a, b) => b.localeCompare(a)); break;
      case 'short': sorted.sort((a, b) => a.length - b.length || a.localeCompare(b)); break;
      case 'long': sorted.sort((a, b) => b.length - a.length || a.localeCompare(b)); break;
    }
  }
  sorted.sort((a, b) => Number(isPushed(a)) - Number(isPushed(b)));
  lastPushSorted = sorted;

  // Clamp cursor navigasi biar gak nunjuk ke index yang udah gak ada (misal
  // abis blokir kata, list-nya nyusut). Kalau cursor lagi nunjuk ke posisi
  // yang belum ke-render (di luar pushRenderLimit), otomatis lebarin
  // render limit-nya biar card-nya beneran muncul dan bisa di-highlight.
  // Semua ini di-skip kalau cursor masih null (belum ada yang dipilih) --
  // jangan maksa jadi 0 di sini, ntar balik lagi ke bug lama.
  if (pushCursorIndex !== null) {
    if (pushCursorIndex > sorted.length - 1) pushCursorIndex = Math.max(0, sorted.length - 1);
    if (pushCursorIndex < 0) pushCursorIndex = 0;
    if (!pushRangeMode && pushCursorIndex >= pushRenderLimit) {
      pushRenderLimit = Math.ceil((pushCursorIndex + 1) / PUSH_RENDER_STEP) * PUSH_RENDER_STEP;
    }
  }

  if (pushRangeMode) {
    const infoTextEl = document.getElementById('pushRangeInfoText');
    const confirmBtn = document.getElementById('pushRangeConfirmBtn');
    if (pushRangeLo === null) {
      infoTextEl.textContent = 'Tap kata pertama buat mulai milih rentang';
      confirmBtn.disabled = true;
    } else {
      const rangeWords = lastPushSorted.slice(pushRangeLo, pushRangeHi + 1);
      const belumCount = rangeWords.filter(w => !isPushed(w)).length;
      const first = lastPushSorted[pushRangeLo];
      const last = lastPushSorted[pushRangeHi];
      infoTextEl.textContent = pushRangeLo === pushRangeHi
        ? `1 kata dipilih ("${first}")`
        : `${rangeWords.length.toLocaleString('id-ID')} kata dipilih (dari "${first}" s/d "${last}") • ${belumCount.toLocaleString('id-ID')} belum dipush`;
      confirmBtn.disabled = belumCount === 0;
    }
  }

  const shown = sorted.slice(0, pushRenderLimit);
  let html = shown.map((word, i) => {
    const pushed = isPushed(word);
    const isFav = favorites.includes(word);
    const isSelected = pushRangeMode && pushRangeLo !== null && i >= pushRangeLo && i <= pushRangeHi;
    const isKbSelected = !pushRangeMode && i === pushCursorIndex;
    return `<div class="push-word ${pushed ? 'pushed' : ''} ${isSelected ? 'range-selected' : ''} ${isKbSelected ? 'kb-selected' : ''}" data-push-word="${escapeHtml(word)}">
      <div class="push-word-main">
        <span class="push-word-name">${escapeHtml(word)}${isCustomWord(word) ? '<span class="custom-word-badge">(kata kustom)</span>' : ''}</span>
        <span class="push-word-status">${word.length} huruf</span>
      </div>
      <div class="push-word-actions">
        <span class="pw-icon pw-check ${pushed ? 'on' : ''}" title="${pushed ? 'Sudah dipush' : 'Belum dipush'}">${CHECK_ICON_SVG}</span>
        <span class="pw-icon pw-copy" data-pw-copy="${escapeHtml(word)}" title="Copy kata">${COPY_ICON_SVG}</span>
        <span class="pw-icon pw-star ${isFav ? 'on' : ''}" data-pw-fav="${escapeHtml(word)}" title="Favorit">★</span>
        <span class="pw-icon pw-block" data-pw-block="${escapeHtml(word)}" title="Blokir">✕</span>
      </div>
    </div>`;
  }).join('');
  if (sorted.length > pushRenderLimit) {
    html += `<div class="push-empty">Muncul ${pushRenderLimit} dari ${sorted.length.toLocaleString('id-ID')} kata, scroll buat lebih banyak...</div>`;
  }
  container.innerHTML = html;

  if (!pushRangeMode) {
    const activeCard = container.querySelector('.push-word.kb-selected');
    if (activeCard) activeCard.scrollIntoView({ block: 'nearest' });
  }
}

async function pushSingleWord(word) {
  if (isPushed(word)) {
    pushedWords = pushedWords.filter(w => w !== word);
  } else {
    pushedWords.push(word);
    pushUndoStack.push({ type: 'push', words: [word] });
    if (pushUndoStack.length > PUSH_UNDO_LIMIT) pushUndoStack.shift();
    updatePushUndoBtn();
  }
  pushedSet = new Set(pushedWords);
  letterStats = null;
  await savePushedWords();
}

// Dipake bareng oleh klik tombol ✕ dan shortcut keyboard Backspace -- 2 cara
// beda buat manggil aksi yang sama persis.
async function blockWordFromPush(word) {
  if (customWordsSet.has(word)) {
    customWords = customWords.filter(cw => cw !== word);
    if (!baseDictSet.has(word)) DICTIONARY = DICTIONARY.filter(dw => dw !== word);
    pushedWords = pushedWords.filter(pw => pw !== word);
    rebuildCaches();
    pushUndoStack.push({ type: 'customDelete', words: [word] });
    if (pushUndoStack.length > PUSH_UNDO_LIMIT) pushUndoStack.shift();
    updatePushUndoBtn();
    await saveCustomWords();
    await savePushedWords();
    showToast(`🗑️ "${word}" dihapus dari kata kustom`);
    return;
  }
  blocked.push(word);
  blockedSet.add(word);
  pushUndoStack.push({ type: 'block', words: [word] });
  if (pushUndoStack.length > PUSH_UNDO_LIMIT) pushUndoStack.shift();
  updatePushUndoBtn();
  await saveBlocked();
  checkAndReportWords();
  document.getElementById('blockedCount').textContent = blocked.length;
  letterStats = null;
  showToast(`🚫 ${word} diblokir`);
}

document.getElementById('pushWords').addEventListener('click', async (e) => {
  const copyEl = e.target.closest('[data-pw-copy]');
  if (copyEl) {
    await copyWordToClipboard(copyEl.dataset.pwCopy);
    return;
  }
  const favEl = e.target.closest('[data-pw-fav]');
  if (favEl) {
    const w = favEl.dataset.pwFav;
    if (favorites.includes(w)) favorites = favorites.filter(x => x !== w);
    else favorites.push(w);
    favoritesSet = new Set(favorites);
    await saveFavorites();
    renderPushIndex();
    return;
  }
  const blockEl = e.target.closest('[data-pw-block]');
  if (blockEl) {
    if (pushRangeMode) { showToast('⚠️ selesai/batalin Pilih Rentang dulu buat blokir kata'); return; }
    await blockWordFromPush(blockEl.dataset.pwBlock);
    renderPushIndex();
    return;
  }
  const card = e.target.closest('[data-push-word]');
  if (card) {
    const word = card.dataset.pushWord;
    if (pushRangeMode) {
      const idx = lastPushSorted.indexOf(word);
      if (idx === -1) return;
      if (pushRangeLo === null) {
        pushRangeLo = idx;
        pushRangeHi = idx;
      } else {
        // Tap ketiga dst: geser handle (lo/hi) yang paling deket ke titik
        // tengah rentang yang lagi aktif -- mekanisme ini juga otomatis nutup
        // kasus tap kedua (lo===hi jadi mid===idx pertama, jadi langsung
        // kebentuk rentang yang bener tanpa perlu case terpisah).
        const mid = (pushRangeLo + pushRangeHi) / 2;
        if (idx > mid) pushRangeHi = idx; else pushRangeLo = idx;
        if (pushRangeLo > pushRangeHi) { const t = pushRangeLo; pushRangeLo = pushRangeHi; pushRangeHi = t; }
      }
      renderPushIndex();
      return;
    }
    await pushSingleWord(word);
    renderPushIndex();
    restorePushInputFocus();
  }
});

function updatePushUndoBtn() {
  const btn = document.getElementById('pushUndoBtn');
  if (!btn) return;
  btn.disabled = pushUndoStack.length === 0;
}

async function performPushUndo() {
  if (pushUndoStack.length === 0) return;
  const batch = pushUndoStack.pop();
  const batchSet = new Set(batch.words);
  let label;
  if (batch.type === 'block') {
    blocked = blocked.filter(w => !batchSet.has(w));
    blockedSet = new Set(blocked);
    letterStats = null;
    await saveBlocked();
    label = 'dibuka blokirnya';
  } else if (batch.type === 'customDelete') {
    // Balikin ke daftar kata kustom + dictionary (kalau memang bukan bagian
    // dari kamus dasar, jadi harus ditambahin manual lagi).
    for (const w of batch.words) {
      if (!customWordsSet.has(w)) customWords.push(w);
    }
    DICTIONARY = Array.from(new Set([...DICTIONARY, ...batch.words])).sort();
    rebuildCaches();
    letterStats = null;
    await saveCustomWords();
    label = 'dibalikin ke kata kustom';
  } else {
    pushedWords = pushedWords.filter(w => !batchSet.has(w));
    pushedSet = new Set(pushedWords);
    letterStats = null;
    await savePushedWords();
    label = 'dibatalkan dari push';
  }
  updatePushUndoBtn();
  renderPushIndex();
  render();
  showToast(batch.words.length === 1
    ? `"${batch.words[0]}" ${label}`
    : `${batch.words.length.toLocaleString('id-ID')} kata ${label}`);
}

document.getElementById('pushUndoBtn').addEventListener('click', performPushUndo);

// Shortcut global Ctrl+Z / Cmd+Z buat undo push/blokir terakhir -- sengaja
// dipasang sebagai listener KEYDOWN TERPISAH (bukan digabung ke listener
// besar di bawah yang buang semua kombinasi ber-Ctrl/Cmd/Alt), dan sengaja
// TIDAK dibatasin cuma pas tab Push aktif -- biar kepencet dari mana aja
// (misal abis blokir kata dari tab pencarian) tetep kena, sama kayak
// nge-klik tombol Undo manual. Dicek dulu gak lagi ngetik di
// input/textarea/contenteditable biar gak nabrak Ctrl+Z bawaan browser pas
// user lagi ngedit teks di form manapun.
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
  const active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
  if (pushUndoStack.length === 0) return;
  e.preventDefault();
  performPushUndo();
});



document.getElementById('pushAllBtn').addEventListener('click', async () => {
  const list = wordsForIndex(selectedStart, selectedEnd);
  if (!list.length) { showToast('⚠️ pilih awalan/akhiran dulu'); return; }
  const belum = list.filter(w => !isPushed(w));
  if (belum.length === 0) { showToast('✅ semua kata di filter ini udah kepush'); return; }
  const ok = window.confirm(`Push ${belum.length.toLocaleString('id-ID')} kata sekaligus? Bisa di-undo abis ini.`);
  if (!ok) return;
  const count = await pushWordsBatch(belum);
  renderPushIndex();
  showToast(`✅ ${count.toLocaleString('id-ID')} kata di-push sekaligus`);
});

document.getElementById('pushRangeToggleBtn').addEventListener('click', () => {
  const willActivate = !pushRangeMode;
  resetPushRangeState();
  if (willActivate) {
    pushRangeMode = true;
    document.getElementById('pushRangeToggleBtn').classList.add('active');
    document.getElementById('pushRangeInfo').style.display = '';
  }
  renderPushIndex();
});

document.getElementById('pushRangeCancelBtn').addEventListener('click', () => {
  resetPushRangeState();
  renderPushIndex();
});

document.getElementById('pushRangeConfirmBtn').addEventListener('click', async () => {
  if (pushRangeLo === null) return;
  const rangeWords = lastPushSorted.slice(pushRangeLo, pushRangeHi + 1);
  const belum = rangeWords.filter(w => !isPushed(w));
  if (belum.length === 0) return;
  const ok = window.confirm(`Push ${belum.length.toLocaleString('id-ID')} kata dari rentang yang dipilih? Bisa di-undo abis ini.`);
  if (!ok) return;
  const count = await pushWordsBatch(belum);
  resetPushRangeState();
  renderPushIndex();
  showToast(`✅ ${count.toLocaleString('id-ID')} kata di-push dari rentang`);
});

let pushLastFocusedInput = null;

// ---- Keyboard shortcut buat tab Push (khusus PC, gak aktif kalo lagi ngetik) ----
// Cuma jalan pas: tab Push aktif, gak ada modal kebuka, dan gak ada input/textarea
// manapun yang lagi difokus (biar gak nabrak keyboard biasa pas user ngetik manual).
let pushKeyboardRow = null; // 'start' (awalan) | 'end' (akhiran) | null

function pushKeyboardIsAllowed() {
  // Fitur ini khusus PC (butuh keyboard fisik). Di device touch-only (gak
  // ada mouse/hover beneran, kayak HP/tablet) matiin dari sini -- jaga-jaga
  // biar walau ada bug lain nyerempet cursor/scroll punya fitur ini, gak
  // ada satupun listener di bawah yang kepicu di mobile.
  if (window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches) return false;
  const pushView = document.getElementById('pushView');
  if (!pushView || !pushView.classList.contains('active')) return false;
  if (document.querySelector('.modal-overlay.show')) return false;
  const active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return false;
  return true;
}

function renderPushKeyboardFocusIndicator() {
  const startGroup = document.getElementById('startIndexGrid').closest('.index-group');
  const endGroup = document.getElementById('endIndexGrid').closest('.index-group');
  if (startGroup) startGroup.classList.toggle('kb-focus', pushKeyboardRow === 'start');
  if (endGroup) endGroup.classList.toggle('kb-focus', pushKeyboardRow === 'end');
}

function pushKeyboardCurrentLetter(row) {
  const current = row === 'start' ? selectedStart : selectedEnd;
  return (current && current.length === 1) ? current : PUSH_LETTERS[0];
}

function pushKeyboardApplyLetter(row, letter) {
  if (row === 'start') {
    selectedStart = letter;
    document.getElementById('pushAwalanInput').value = letter;
  } else {
    selectedEnd = letter;
    document.getElementById('pushAkhiranInput').value = letter;
  }
  resetPushRangeState();
  pushRenderLimit = PUSH_RENDER_STEP;
  renderPushIndex();
  renderPushKeyboardFocusIndicator();
}

document.addEventListener('keydown', async (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return; // jangan ganggu shortcut browser/OS (Ctrl+C, Cmd+R, dll)
  if (!pushKeyboardIsAllowed()) return;

  if (e.key === 'Tab') {
    e.preventDefault();
    pushKeyboardRow = pushKeyboardRow === 'start' ? 'end' : 'start';
    renderPushKeyboardFocusIndicator();
    return;
  }

  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    // Dimatiin pas mode Pilih Rentang aktif -- di situ navigasi kata dipilih
    // lewat tap, bukan keyboard, biar gak dobel arti.
    if (pushRangeMode) return;
    const max = Math.max(0, (lastPushSorted || []).length - 1);
    if (pushCursorIndex === null) {
      // Belum ada cursor aktif -- pencetan pertama yang nentuin mulai dari
      // mana: ↓ mulai dari kata paling atas, ↑ mulai dari paling bawah.
      pushCursorIndex = e.key === 'ArrowDown' ? 0 : max;
    } else {
      pushCursorIndex = e.key === 'ArrowUp'
        ? Math.max(0, pushCursorIndex - 1)
        : Math.min(max, pushCursorIndex + 1);
    }
    renderPushIndex();
    return;
  }

  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    if (!pushKeyboardRow) pushKeyboardRow = 'start';
    const cur = pushKeyboardCurrentLetter(pushKeyboardRow);
    let idx = PUSH_LETTERS.indexOf(cur);
    if (idx === -1) idx = 0;
    idx = e.key === 'ArrowLeft' ? (idx - 1 + 26) % 26 : (idx + 1) % 26;
    pushKeyboardApplyLetter(pushKeyboardRow, PUSH_LETTERS[idx]);
    return;
  }

  if (/^[a-zA-Z]$/.test(e.key)) {
    e.preventDefault();
    if (!pushKeyboardRow) pushKeyboardRow = 'start';
    pushKeyboardApplyLetter(pushKeyboardRow, e.key.toLowerCase());
    return;
  }

  if (['1', '2', '3', '4', '5'].includes(e.key)) {
    e.preventDefault();
    const sortMap = { '1': 'az', '2': 'za', '3': 'short', '4': 'long', '5': 'random' };
    pushSortMode = sortMap[e.key];
    // pushSortSelect itu custom dropdown (bukan <select> asli), jadi
    // update-nya kudu lewat setCustomSelectValue biar label & opsi aktif
    // di tampilan ikut ke-sinkron -- fireChange false soalnya kita udah
    // manggil renderPushIndex() sendiri di bawah, gak perlu dobel trigger.
    setCustomSelectValue(document.getElementById('pushSortSelect'), pushSortMode, false);
    if (pushSortMode === 'random') pushRandomSnapshot = null;
    resetPushRangeState();
    pushRenderLimit = PUSH_RENDER_STEP;
    renderPushIndex();
    return;
  }

  if (e.key === 'Enter') {
    e.preventDefault();
    if (pushRangeMode) return;
    // Push kata yang lagi "dipilih" (posisi cursor), bukan selalu yang
    // paling atas -- cursor-nya sengaja gak digeser abis ini, jadi kata yang
    // naik ngisi slot yang sama otomatis "kepilih" berikutnya.
    const word = (lastPushSorted || [])[pushCursorIndex];
    if (!word) { showToast('gak ada kata buat di-push'); return; }
    await pushSingleWord(word);
    renderPushIndex();
    return;
  }

  if (e.key === 'Backspace') {
    e.preventDefault();
    if (pushRangeMode) { showToast('⚠️ selesai/batalin Pilih Rentang dulu buat blokir kata'); return; }
    const word = (lastPushSorted || [])[pushCursorIndex];
    if (!word) return;
    await blockWordFromPush(word);
    renderPushIndex();
    return;
  }

  if (e.key === 'Escape') {
    e.preventDefault();
    if (pushKeyboardRow === 'start') {
      selectedStart = null;
      document.getElementById('pushAwalanInput').value = '';
    } else if (pushKeyboardRow === 'end') {
      selectedEnd = null;
      document.getElementById('pushAkhiranInput').value = '';
    }
    pushKeyboardRow = null;
    resetPushRangeState();
    pushRenderLimit = PUSH_RENDER_STEP;
    renderPushIndex();
    renderPushKeyboardFocusIndicator();
    return;
  }
});

document.getElementById('pushAwalanInput').addEventListener('focus', () => { pushLastFocusedInput = 'awalan'; });
document.getElementById('pushAkhiranInput').addEventListener('focus', () => { pushLastFocusedInput = 'akhiran'; });

function restorePushInputFocus() {
  if (window.innerWidth <= 768) return;
  if (!pushLastFocusedInput) return;
  const el = document.getElementById(pushLastFocusedInput === 'awalan' ? 'pushAwalanInput' : 'pushAkhiranInput');
  if (!el) return;
  const pos = el.value.length;
  el.focus({ preventScroll: true });
  el.setSelectionRange(pos, pos);
}

const debouncedPushSearch = debounce(() => { pushRenderLimit = PUSH_RENDER_STEP; renderPushIndex(); }, 150);
document.getElementById('pushAwalanInput').addEventListener('input', e => {
  const v = e.target.value.trim().toLowerCase();
  selectedStart = v.length ? v : null;
  resetPushRangeState();
  debouncedPushSearch();
});
document.getElementById('pushAkhiranInput').addEventListener('input', e => {
  const v = e.target.value.trim().toLowerCase();
  selectedEnd = v.length ? v : null;
  resetPushRangeState();
  debouncedPushSearch();
});

document.querySelectorAll('[data-clear-index]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.clearIndex === 'start') {
      selectedStart = null;
      document.getElementById('pushAwalanInput').value = '';
    } else {
      selectedEnd = null;
      document.getElementById('pushAkhiranInput').value = '';
    }
    resetPushRangeState();
    pushRenderLimit = PUSH_RENDER_STEP;
    renderPushIndex();
  });
});

document.getElementById('pushResetAll').addEventListener('click', async () => {
  if (pushedWords.length === 0) return;
  const ok = window.confirm('Reset seluruh progress push index? Semua kata yang udah dipush bakal dihapus dan ga bisa dibalikin.');
  if (!ok) return;
  pushedWords = [];
  pushUndoStack = [];
  resetPushRangeState();
  updatePushUndoBtn();
  rebuildCaches();
  await savePushedWords();
  renderPushIndex();
  showToast('🔄 index direset');
});

document.getElementById('pushViewToggle').addEventListener('click', e => {
  const btn = e.target.closest('button[data-pv]');
  if (!btn) return;
  document.querySelectorAll('#pushViewToggle button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  pushViewMode = btn.dataset.pv;
  renderPushIndex();
});
document.getElementById('pushSortSelect').addEventListener('change', e => {
  pushSortMode = e.target.value;
  if (pushSortMode === 'random') pushRandomSnapshot = null;
  resetPushRangeState();
  pushRenderLimit = PUSH_RENDER_STEP;
  renderPushIndex();
});

function switchTab(tabName) {
  activeTab = tabName;
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === tabName));
  document.querySelectorAll('.search-section').forEach(el => el.style.display = tabName === 'pencarian' ? '' : 'none');
  document.getElementById('pushView').classList.toggle('active', tabName === 'push');
  document.getElementById('kompeView').classList.toggle('active', tabName === 'kompe');
  if (tabName === 'push') renderPushIndex();
  if (tabName === 'kompe') {
    clearKompeSearch();
    renderKompe();
  }
  updateGuideButton(tabName);
}

const guideLabels = { pencarian: 'Panduan Pencarian', push: 'Panduan Push', kompe: 'Panduan Kompe' };
function updateGuideButton(tabName) {
  const btn = document.getElementById('guideFloatBtn');
  if (btn) btn.textContent = guideLabels[tabName] || 'Panduan';
}
document.getElementById('guideFloatBtn').addEventListener('click', () => {
  document.querySelectorAll('.guide-content').forEach(el => {
    el.style.display = 'none';
  });
  const map = { pencarian: 'guideContentPencarian', push: 'guideContentPush', kompe: 'guideContentKompe' };
  const target = document.getElementById(map[activeTab] || 'guideContentPencarian');
  if (target) target.style.display = '';
  document.getElementById('caraBermainModal').classList.add('show');
  document.getElementById('guideFloatBtn').classList.add('hidden');
});
document.getElementById('closeCaraBermainModal').addEventListener('click', () => {
  document.getElementById('caraBermainModal').classList.remove('show');
  applyGuideVisibility();
});

let guideEnabled = true;
async function loadGuidePref() {
  const g = await storageGet('samkat_guide_enabled');
  guideEnabled = g === null ? true : g === 'true';
  applyGuideVisibility();
}
function applyGuideVisibility() {
  const btn = document.getElementById('guideFloatBtn');
  if (btn) btn.classList.toggle('hidden', !guideEnabled);
  const checkbox = document.getElementById('guideToggleCheckbox');
  if (checkbox) checkbox.checked = guideEnabled;
}
document.getElementById('guideToggleCheckbox').addEventListener('change', e => {
  guideEnabled = e.target.checked;
  applyGuideVisibility();
  storageSet('samkat_guide_enabled', String(guideEnabled));
});

let searchPushEnabled = false;
async function loadSearchPushPref() {
  const s = await storageGet('samkat_search_push_enabled');
  searchPushEnabled = s === null ? false : s === 'true';
  const checkbox = document.getElementById('searchPushToggleCheckbox');
  if (checkbox) checkbox.checked = searchPushEnabled;
}
document.getElementById('searchPushToggleCheckbox').addEventListener('change', e => {
  searchPushEnabled = e.target.checked;
  storageSet('samkat_search_push_enabled', String(searchPushEnabled));
  render();
});

// ---- Preset Kompe ----
// kompeGroups tetep ada sebagai "jendela" ke grup preset yang lagi aktif --
// isinya union dari grup preset aktif Mode Normal + grup preset aktif Mode
// Brutal. Semua kode lama yang manggil kompeGroups.filter/find/push/dst ttp
// jalan apa adanya, otomatis ke-scope ke preset aktif tanpa disentuh manual.
// Data aslinya (per preset, per mode) disimpen di kompePresets; sinkronisasi
// dua arah ditangani lewat rebuildKompeGroupsUnion() & saveKompeGroups().
const MAX_KOMPE_PRESETS = 10;
// Username yang dibolehin nyimpen preset tanpa batas ditentuin di BACKEND
// (env var UNLIMITED_KOMPE_PRESET_USERNAMES di wrangler.jsonc), bukan di sini.
// Frontend cuma nurut flag `kompeUnlimitedPresets` yang dikirim server pas
// login & tiap pull /sync (lihat handleLogin/handleSyncGet di backend).
let kompeUnlimitedPresets = false;
function getMaxKompePresets() {
  return kompeUnlimitedPresets ? Infinity : MAX_KOMPE_PRESETS;
}
let kompePresets = { normal: [], brutal: [] };
let kompeActivePresetId = { normal: null, brutal: null };
let kompePresetEditMode = false;

let kompeGroups = [];
let kompeActiveGroupId = null;
let kompeUsedWords = new Set(); // kata yang udah di-klik/di-hide, dipake bareng list badge & Kelola Trap Word
// Urutan grup yang diprioritasin manual lewat klik card -- index 0 = prioritas
// paling atas (klik pertama), makin gede index makin bawah. Grup yang gak ada
// di sini disortir pake weight seperti biasa, taruh di bawah semua yang dipin.
// Sengaja gak disimpen ke storage/server -- ini state sementara per sesi main.
let kompePinnedGroupIds = [];
let kompeMode = 'normal';
let kompeOpenMenuGroupId = null;
let kompeExpandedGroupId = null; // card grup trap yg lagi expand (dipindah dari modal Kelola Trap Word)

// ---- Trap explore (eksplorasi trap word baru) ----
// catatan: trap yang udah "ditambah" itu sekarang ya kompeGroups biasa (mode normal/brutal),
// ga ada state trapWords terpisah lagi -- jadi Grup Trap sidebar & Kelola Trap Word sama-sama
// baca/tulis ke kompeGroups.
let trapLength = 5;
let trapFreqCache = {}; // { [length]: { suf: Map, pre: Map } } -- diinvalidate di rebuildCaches()
const TRAP_RENDER_STEP = 50;
let trapRenderLimit = TRAP_RENDER_STEP;
let lastTrapResults = [];
let trapAddPickerSegment = null; // segmen yg lagi nampilin picker Normal/Brutal (suffix 2-3 huruf)
let trapExpandedSegment = null; // segmen yg lagi expand buat liat daftar trigger/counter di panel Eksplorasi Trap

function getTrapWordLists(segment) {
  const triggers = DICTIONARY.filter(w => w.endsWith(segment) && w !== segment && !blockedSet.has(w));
  const counters = DICTIONARY.filter(w => w.startsWith(segment) && w !== segment && !blockedSet.has(w));
  return { triggers, counters };
}

// ---- Kelola Trap Word modal ----
let kelolaTrapActiveTab = 'normal';
let kelolaTrapOpenCardId = null;

function getTrapFreq(length) {
  if (!trapFreqCache[length]) {
    const suf = new Map();
    const pre = new Map();
    for (const w of DICTIONARY) {
      if (blockedSet.has(w)) continue;
      if (w.length <= length) continue;
      const s = w.slice(-length);
      suf.set(s, (suf.get(s) || 0) + 1);
      const p = w.slice(0, length);
      pre.set(p, (pre.get(p) || 0) + 1);
    }
    trapFreqCache[length] = { suf, pre };
  }
  return trapFreqCache[length];
}

// getTrapFreq() itu mahal -- tiap panjang beda (2/3/4/5 huruf) scan seluruh
// DICTIONARY sekali. Kalau dibiarin "males" (baru dibangun pas dipanggil),
// pencarian PERTAMA di mode Kompe abis buka app / abis rebuildCaches() bakal
// nge-lag nunggu 4x scan itu. Jadi dibangun duluan di background pas app lagi
// nganggur (requestIdleCallback), biar pas user beneran mulai ngetik carinya udah cepet.
let kompeTrapFreqWarmupTimer = null;
function scheduleKompeTrapFreqWarmup() {
  if (kompeTrapFreqWarmupTimer !== null) return; // udah keantre, gausah dobel
  const run = () => {
    kompeTrapFreqWarmupTimer = null;
    [2, 3, 4, 5].forEach(L => getTrapFreq(L));
  };
  if (typeof requestIdleCallback === 'function') {
    kompeTrapFreqWarmupTimer = requestIdleCallback(run, { timeout: 2000 });
  } else {
    kompeTrapFreqWarmupTimer = setTimeout(run, 300);
  }
}

function isTrapWordActive(segment) {
  return kompeGroups.some(g => g.segment === segment);
}

function computeTrapCandidates() {
  const { suf, pre } = getTrapFreq(trapLength);
  const triggerMinEl = document.getElementById('trapTriggerMin');
  const triggerMaxEl = document.getElementById('trapTriggerMax');
  const counterMinEl = document.getElementById('trapCounterMin');
  const counterMaxEl = document.getElementById('trapCounterMax');
  const triggerMin = triggerMinEl && triggerMinEl.value !== '' ? Number(triggerMinEl.value) : null;
  const triggerMax = triggerMaxEl && triggerMaxEl.value !== '' ? Number(triggerMaxEl.value) : null;
  const counterMin = counterMinEl && counterMinEl.value !== '' ? Number(counterMinEl.value) : null;
  const counterMax = counterMaxEl && counterMaxEl.value !== '' ? Number(counterMaxEl.value) : null;

  const results = [];
  for (const [segment, triggerCount] of suf.entries()) {
    const counterCount = pre.get(segment) || 0;
    // aturan wajib: suffix 2-3 huruf -> trigger harus > counter
    if (trapLength <= 3 && !(triggerCount > counterCount)) continue;
    // aturan wajib: suffix 2-3 huruf -> solve (counter) minimal 3, kalau kurang jangan ditampilkan
    if (trapLength <= 3 && counterCount < 3) continue;
    // filter opsional (tetep jalan buat semua panjang suffix)
    if (triggerMin !== null && triggerCount < triggerMin) continue;
    if (triggerMax !== null && triggerCount > triggerMax) continue;
    if (counterMin !== null && counterCount < counterMin) continue;
    if (counterMax !== null && counterCount > counterMax) continue;
    results.push({ segment, triggerCount, counterCount });
  }
  results.sort((a, b) => a.counterCount - b.counterCount || b.triggerCount - a.triggerCount || a.segment.localeCompare(b.segment));
  return results;
}

function computeKompeGroup(segment, weight, groupMode) {
  segment = segment.trim().toLowerCase();
  if (!segment) return null;
  const triggers = DICTIONARY.filter(w => w.endsWith(segment) && w !== segment && !blockedSet.has(w));
  const counters = DICTIONARY.filter(w => w.startsWith(segment) && w !== segment && !blockedSet.has(w));
  return { id: 'g' + Date.now(), segment, weight: Math.min(10000, Math.max(0, Number(weight) || 0)), mode: groupMode || 'normal', triggers, counters };
}

// Bikin/update satu kompeGroup, dipake bareng sama modal "Buat Grup" (submit manual)
// dan tombol "+Tambah" di panel Eksplorasi Trap / Kelola Trap Word.
async function submitKompeGroup(segment, groupMode, weight) {
  segment = segment.trim().toLowerCase();
  weight = Math.min(10000, Math.max(0, Number(weight) || 0));
  if (!segment) return { ok: false, msg: '⚠️ segmen kosong' };

  const existing = kompeGroups.find(g => g.segment === segment);
  if (existing) {
    existing.weight = weight;
    existing.mode = groupMode;
    kompeActiveGroupId = existing.id;
    await saveKompeGroups();
    return { ok: true, updated: true, group: existing, msg: `✅ grup "${segment}" diperbarui (weight ${weight}, ${groupMode})` };
  }

  const group = computeKompeGroup(segment, weight, groupMode);
  if (!group.triggers.length && !group.counters.length) {
    return { ok: false, msg: '⚠️ ga ada kata yang cocok buat segmen ini' };
  }
  kompeGroups.push(group);
  kompeActiveGroupId = group.id;
  await saveKompeGroups();
  return { ok: true, updated: false, group, msg: `✅ grup "${segment}" dibuat (weight ${weight}, ${groupMode})` };
}

function renderKompeGroupList() {
  const list = document.getElementById('kompeGroupList');
  const inMode = kompeGroups.filter(g => g.mode === kompeMode);

  if (inMode.length === 0) {
    list.innerHTML = `<div class="push-empty" style="padding:20px 8px;">Belum ada grup di Mode ${kompeMode === 'brutal' ? 'Brutal' : 'Normal'}. Klik Buat Grup buat mulai.</div>`;
    if (!inMode.some(g => g.id === kompeActiveGroupId)) kompeActiveGroupId = null;
    return;
  }
  if (!inMode.some(g => g.id === kompeActiveGroupId)) kompeActiveGroupId = null;

  const sorted = sortKompeGroupsByPriority(inMode, g => g.id, g => g.weight, g => g.segment);
  list.innerHTML = sorted.map(g => {
    const expanded = kompeExpandedGroupId === g.id;
    const triggerWords = g.triggers.filter(w => !kompeUsedWords.has(w));
    const counterWords = g.counters.filter(w => !kompeUsedWords.has(w));
    return `
    <div class="kompe-group-item">
      <button class="kompe-group-select ${g.id === kompeActiveGroupId ? 'active' : ''}" data-kompe-group="${g.id}">
        <span class="kompe-group-name">${escapeHtml(g.segment)}</span>
        <span class="kompe-group-count">${g.triggers.length}<span class="sep">/</span>${g.counters.length}</span>
      </button>
      <button class="kompe-group-expand-btn ${expanded ? 'open' : ''}" data-kompe-expand="${g.id}" title="Lihat trigger/counter"><span class="icon-chevron ${expanded ? 'icon-chevron-up' : ''}"></span></button>
      <button class="kompe-group-menu-btn" data-kompe-menu="${g.id}"><span class="icon-dots"><span></span><span></span><span></span></span></button>
      <div class="kompe-group-menu ${kompeOpenMenuGroupId === g.id ? 'show' : ''}" data-menu-for="${g.id}">
        <div class="kompe-menu-weight-row">
          <input type="number" min="0" max="10000" step="1" value="${g.weight}" class="kompe-menu-weight-input" placeholder="0-10000">
          <button data-menu-weight-apply="${g.id}" title="Simpan weight">✓</button>
        </div>
        <button data-menu-delete>🗑️ Hapus Grup</button>
      </div>
      ${expanded ? `<div class="kompe-group-expand-panel" data-expand-for="${g.id}">
        <div class="kelola-trap-card-col">
          <div class="kelola-trap-card-col-title">Trigger (${triggerWords.length})</div>
          <div class="kelola-trap-card-words">${triggerWords.map(w => `<span data-kompe-expand-word="${escapeHtml(w)}">${escapeHtml(w)}</span>`).join('') || '<span class="kompe-modal-empty">—</span>'}</div>
        </div>
        <div class="kelola-trap-card-col">
          <div class="kelola-trap-card-col-title">Counter/Solve (${counterWords.length})</div>
          <div class="kelola-trap-card-words">${counterWords.map(w => `<span data-kompe-expand-word="${escapeHtml(w)}">${escapeHtml(w)}</span>`).join('') || '<span class="kompe-modal-empty">—</span>'}</div>
        </div>
      </div>` : ''}
    </div>
  `;
  }).join('');
}

document.getElementById('kompeGroupList').addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  const inputEl = e.target.closest('.kompe-menu-weight-input');
  if (!inputEl) return;
  e.preventDefault();
  const menuEl = inputEl.closest('.kompe-group-menu');
  const id = menuEl.dataset.menuFor;
  const group = kompeGroups.find(g => g.id === id);
  if (group) {
    group.weight = Math.min(10000, Math.max(0, Number(inputEl.value) || 0));
    await saveKompeGroups();
  }
  kompeOpenMenuGroupId = null;
  renderKompeGroupList();
});

document.getElementById('kompeGroupList').addEventListener('click', async (e) => {
  const expandBtn = e.target.closest('.kompe-group-expand-btn');
  if (expandBtn) {
    e.stopPropagation();
    const id = expandBtn.dataset.kompeExpand;
    kompeExpandedGroupId = kompeExpandedGroupId === id ? null : id;
    kompeOpenMenuGroupId = null;
    renderKompeGroupList();
    return;
  }

  const expandWordEl = e.target.closest('[data-kompe-expand-word]');
  if (expandWordEl) {
    kompeUsedWords.add(expandWordEl.dataset.kompeExpandWord);
    renderKompeGroupList();
    renderKompe();
    return;
  }

  const menuBtn = e.target.closest('.kompe-group-menu-btn');
  if (menuBtn) {
    e.stopPropagation();
    const id = menuBtn.dataset.kompeMenu;
    kompeOpenMenuGroupId = kompeOpenMenuGroupId === id ? null : id;
    kompeExpandedGroupId = null;
    renderKompeGroupList();
    return;
  }

  const weightApplyBtn = e.target.closest('[data-menu-weight-apply]');
  if (weightApplyBtn) {
    const id = weightApplyBtn.dataset.menuWeightApply;
    const inputEl = weightApplyBtn.parentElement.querySelector('.kompe-menu-weight-input');
    const group = kompeGroups.find(g => g.id === id);
    if (group && inputEl) {
      group.weight = Math.min(10000, Math.max(0, Number(inputEl.value) || 0));
      await saveKompeGroups();
    }
    kompeOpenMenuGroupId = null;
    renderKompeGroupList();
    return;
  }

  const deleteBtn = e.target.closest('[data-menu-delete]');
  if (deleteBtn) {
    const id = deleteBtn.closest('.kompe-group-menu').dataset.menuFor;
    const group = kompeGroups.find(g => g.id === id);
    const ok = window.confirm(`Hapus grup "${group ? group.segment : ''}"? Ga bisa dibalikin.`);
    if (!ok) return;
    kompeGroups = kompeGroups.filter(g => g.id !== id);
    if (kompeActiveGroupId === id) kompeActiveGroupId = null;
    if (kompeExpandedGroupId === id) kompeExpandedGroupId = null;
    const pinIdx = kompePinnedGroupIds.indexOf(id);
    if (pinIdx !== -1) kompePinnedGroupIds.splice(pinIdx, 1);
    await saveKompeGroups();
    kompeOpenMenuGroupId = null;
    renderKompe();
    return;
  }

  const selectBtn = e.target.closest('.kompe-group-select');
  if (selectBtn) {
    kompeActiveGroupId = selectBtn.dataset.kompeGroup;
    toggleKompeGroupPriority(selectBtn.dataset.kompeGroup);
    clearKompeSearch();
    renderKompe();
  }
});

document.addEventListener('click', e => {
  if (kompeOpenMenuGroupId && !e.target.closest('.kompe-group-item')) {
    kompeOpenMenuGroupId = null;
    renderKompeGroupList();
  }
  if (kompeExpandedGroupId && !e.target.closest('.kompe-group-item')) {
    kompeExpandedGroupId = null;
    renderKompeGroupList();
  }
});

// ---- Preset Kompe: render & handler ----

function renderKompePresetModal() {
  const mode = kompeMode === 'brutal' ? 'brutal' : 'normal';
  const presets = kompePresets[mode];
  const titleEl = document.getElementById('kompePresetModalTitle');
  if (titleEl) titleEl.textContent = `Preset (Mode ${mode === 'brutal' ? 'Brutal' : 'Normal'})`;

  const toggleBtn = document.getElementById('kompePresetEditToggle');
  if (toggleBtn) toggleBtn.classList.toggle('active', kompePresetEditMode);

  const list = document.getElementById('kompePresetList');
  list.innerHTML = presets.map((p, i) => {
    const isActive = p.id === kompeActivePresetId[mode];
    const countLabel = `${p.groups.length} grup`;
    if (!kompePresetEditMode) {
      return `<button class="kompe-preset-item ${isActive ? 'active' : ''}" data-preset-select="${p.id}">
        <span class="kompe-preset-name">${escapeHtml(p.name)}</span>
        <span class="kompe-preset-count">${countLabel}</span>
      </button>`;
    }
    return `<div class="kompe-preset-item ${isActive ? 'active' : ''}">
      <div class="kompe-preset-reorder">
        <button class="kompe-preset-reorder-btn" data-preset-move-up="${p.id}" ${i === 0 ? 'disabled' : ''} title="Naikin urutan"><span class="icon-caret icon-caret-up"></span></button>
        <button class="kompe-preset-reorder-btn" data-preset-move-down="${p.id}" ${i === presets.length - 1 ? 'disabled' : ''} title="Turunin urutan"><span class="icon-caret icon-caret-down"></span></button>
      </div>
      <input type="text" class="kompe-preset-name-input" data-preset-rename="${p.id}" value="${escapeHtml(p.name)}" maxlength="24">
      <span class="kompe-preset-count">${countLabel}</span>
      <div class="kompe-preset-item-actions">
        <button data-preset-duplicate="${p.id}" ${presets.length >= getMaxKompePresets() ? 'disabled' : ''} title="Duplikat preset">Duplikat</button>
        <button class="danger" data-preset-delete="${p.id}" ${presets.length <= 1 ? 'disabled' : ''} title="Hapus preset">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

function openKompePresetModal() {
  kompePresetEditMode = false;
  renderKompePresetModal();
  document.getElementById('kompePresetModal').classList.add('show');
}

document.getElementById('kompeBukaPresetBtn').addEventListener('click', openKompePresetModal);
document.getElementById('closeKompePresetModal').addEventListener('click', () => {
  document.getElementById('kompePresetModal').classList.remove('show');
});

document.getElementById('kompePresetEditToggle').addEventListener('click', () => {
  kompePresetEditMode = !kompePresetEditMode;
  renderKompePresetModal();
});

document.getElementById('kompeBuatPresetBtn').addEventListener('click', async () => {
  const mode = kompeMode === 'brutal' ? 'brutal' : 'normal';
  const presets = kompePresets[mode];
  if (presets.length >= getMaxKompePresets()) {
    showToast(`⚠️ maks ${MAX_KOMPE_PRESETS} preset di Mode ${mode === 'brutal' ? 'Brutal' : 'Normal'}`);
    return;
  }
  // isi celah nomor kosong duluan (preset ke-N kehapus -> nomor itu kepake lagi)
  const usedNumbers = new Set(presets.map(p => {
    const m = /^Preset (\d+)$/.exec(p.name);
    return m ? Number(m[1]) : null;
  }).filter(n => n !== null));
  let n = 1;
  while (usedNumbers.has(n)) n++;

  const newPreset = { id: makeKompePresetId(), name: `Preset ${n}`, groups: [] };
  presets.push(newPreset);
  kompeActivePresetId[mode] = newPreset.id; // preset baru langsung diaktifin biar bisa lgsg diisi grup
  rebuildKompeGroupsUnion();
  await saveKompePresetsMeta();
  renderKompePresetModal();
  applyKompeModeVisibility();
  renderKompe();
  showToast(`✅ "${newPreset.name}" dibuat & diaktifin`);
});

document.getElementById('kompePresetList').addEventListener('click', async e => {
  const mode = kompeMode === 'brutal' ? 'brutal' : 'normal';
  const presets = kompePresets[mode];

  const selectBtn = e.target.closest('[data-preset-select]');
  if (selectBtn) {
    kompeActivePresetId[mode] = selectBtn.dataset.presetSelect;
    rebuildKompeGroupsUnion();
    await saveKompePresetsMeta();
    renderKompePresetModal();
    applyKompeModeVisibility();
    renderKompe();
    return;
  }

  const upBtn = e.target.closest('[data-preset-move-up]');
  if (upBtn) {
    const id = upBtn.dataset.presetMoveUp;
    const i = presets.findIndex(p => p.id === id);
    if (i > 0) {
      [presets[i - 1], presets[i]] = [presets[i], presets[i - 1]];
      await saveKompePresetsMeta();
      renderKompePresetModal();
    }
    return;
  }

  const downBtn = e.target.closest('[data-preset-move-down]');
  if (downBtn) {
    const id = downBtn.dataset.presetMoveDown;
    const i = presets.findIndex(p => p.id === id);
    if (i !== -1 && i < presets.length - 1) {
      [presets[i + 1], presets[i]] = [presets[i], presets[i + 1]];
      await saveKompePresetsMeta();
      renderKompePresetModal();
    }
    return;
  }

  const dupBtn = e.target.closest('[data-preset-duplicate]');
  if (dupBtn) {
    if (presets.length >= getMaxKompePresets()) {
      showToast(`⚠️ maks ${MAX_KOMPE_PRESETS} preset di Mode ${mode === 'brutal' ? 'Brutal' : 'Normal'}`);
      return;
    }
    const id = dupBtn.dataset.presetDuplicate;
    const src = presets.find(p => p.id === id);
    if (!src) return;
    const copy = {
      id: makeKompePresetId(),
      name: `${src.name} (salinan)`,
      groups: src.groups.map(g => ({ ...g, id: makeKompeGroupId() })),
    };
    presets.push(copy);
    await saveKompePresetsMeta();
    renderKompePresetModal();
    showToast(`✅ "${src.name}" diduplikat`);
    return;
  }

  const delBtn = e.target.closest('[data-preset-delete]');
  if (delBtn) {
    if (presets.length <= 1) return;
    const id = delBtn.dataset.presetDelete;
    const target = presets.find(p => p.id === id);
    const ok = window.confirm(`Hapus "${target ? target.name : 'preset ini'}"? Semua grup di dalamnya ikut kehapus, ga bisa dibalikin.`);
    if (!ok) return;
    const idx = presets.findIndex(p => p.id === id);
    presets.splice(idx, 1);
    if (kompeActivePresetId[mode] === id) {
      kompeActivePresetId[mode] = presets[0].id; // pindah aktif ke preset pertama yg tersisa
    }
    rebuildKompeGroupsUnion();
    await saveKompePresetsMeta();
    renderKompePresetModal();
    applyKompeModeVisibility();
    renderKompe();
    return;
  }
});

document.getElementById('kompePresetList').addEventListener('change', async e => {
  const input = e.target.closest('[data-preset-rename]');
  if (!input) return;
  const mode = kompeMode === 'brutal' ? 'brutal' : 'normal';
  const preset = kompePresets[mode].find(p => p.id === input.dataset.presetRename);
  if (!preset) return;
  const newName = input.value.trim();
  preset.name = newName || preset.name;
  input.value = preset.name;
  await saveKompePresetsMeta();
  applyKompeModeVisibility();
});
document.getElementById('kompePresetList').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.closest('[data-preset-rename]')) {
    e.preventDefault();
    e.target.blur();
  }
});

// Peta prefix berbahaya per mode, dibangun dari trigger tiap grup aktif.
// prefix (2-8 huruf) dari kata trigger -> Set segmen trap yang dia arah ke.
// Di-cache per mode + signature grup, biar ga rebuild tiap render.
let kompeDangerCache = { mode: null, signature: '', map: {} };

function getKompeDangerousPrefixMap() {
  const groupsInMode = kompeGroups.filter(g => g.mode === kompeMode);
  const signature = groupsInMode.map(g => g.id + ':' + g.triggers.length).join('|');
  if (kompeDangerCache.mode === kompeMode && kompeDangerCache.signature === signature) {
    return kompeDangerCache.map;
  }
  const map = {};
  groupsInMode.forEach(g => {
    g.triggers.forEach(w => {
      // mulai dari i=1 biar collapse ke 1 huruf (kata spawn game yg gaada di
      // dictionary sbg prefix apapun) tetep kecek ke dangerMap
      for (let i = 1; i <= Math.min(8, w.length); i++) {
        const prefix = w.slice(0, i);
        if (!map[prefix]) map[prefix] = new Set();
        map[prefix].add(g.segment);
      }
    });
  });
  kompeDangerCache = { mode: kompeMode, signature, map };
  return map;
}

// Kata "berbahaya" (badge merah) = salah satu kemungkinan spawn kata ini
// (2-5 huruf terakhir, mode Brutal) adalah prefix dari kata trigger, yang
// berarti lawan bisa balas pakai kata trigger itu dan giliran solve trap
// balik ke kamu.
//
// Collapse rule: kalau suffix L-huruf kandidat GAADA yang jadi awalan kata
// apapun di dictionary, in-game spawn-nya bakal collapse jadi 1 huruf
// terakhir doang -- itu jauh lebih longgar/bahaya, jadi dicek juga ke
// dangerMap 1-huruf.
//
// Prioritas urutan (bukan filter/hilang, cuma dijadikan opsi belakangan):
// kata yang bisa ke-trigger di suffix 2-huruf dijadikan opsi PALING
// belakang, disusul yang ke-trigger di 3-huruf, lalu 4, lalu 5. Kata yang
// aman di semua panjang tetep paling atas/direkomendasikan duluan.
function computeKompeWordResults(query) {
  const dangerMap = getKompeDangerousPrefixMap();
  const results = [];
  for (const w of DICTIONARY) {
    if (blockedSet.has(w)) continue;
    if (!w.startsWith(query)) continue;
    const traps = new Set();
    let minDangerLen = null; // panjang suffix (2-5) paling kecil yg bahaya
    for (let L = 2; L <= Math.min(5, w.length); L++) {
      let spawn = w.slice(-L);
      // cek: ada ga kata di dictionary yg berawalan suffix ini?
      const { pre } = getTrapFreq(L);
      if (!pre.get(spawn)) {
        // gaada -> in-game bakal collapse jadi 1 huruf terakhir
        spawn = spawn.slice(-1);
      }
      const found = dangerMap[spawn];
      if (found && found.size) {
        found.forEach(t => traps.add(t));
        if (minDangerLen === null || L < minDangerLen) minDangerLen = L;
      }
    }
    const dangerScore = minDangerLen === null ? 0 : (6 - minDangerLen); // 2huruf=4 (terparah) ... 5huruf=1
    results.push({ word: w, segments: Array.from(traps), dangerScore });
  }
  results.sort((a, b) => (a.dangerScore - b.dangerScore) || (a.segments.length - b.segments.length) || a.word.localeCompare(b.word));
  return results;
}

function renderKompeWordResults(query) {
  const container = document.getElementById('kompeWordList');
  if (!query) {
    container.innerHTML = '<div class="push-empty">Ketik awalan kata di atas buat mulai...</div>';
    return;
  }
  const results = computeKompeWordResults(query);
  const visible = results.filter(r => !kompeUsedWords.has(r.word));
  if (!visible.length) {
    container.innerHTML = '<div class="push-empty">Ga ada kata yang cocok.</div>';
    return;
  }
  const shown = visible.slice(0, MAX_KOMPE_RENDER);
  let html = shown.map(r => {
    const cut = query.length;
    const wordHtml = `<span class="kompe-word-key">${r.word.slice(0, cut)}</span><span class="kompe-word-post">${r.word.slice(cut)}</span>`;
    const danger = r.segments.length > 0;
    const badge = danger ? `<span class="kompe-danger-badge" title="trigger: ${r.segments.join(', ')}">trigger: ${r.segments.join(', ')}</span>` : '';
    return `<div class="kompe-word ${danger ? 'danger' : ''}" data-kompe-word="${escapeHtml(r.word)}">
      <span class="kompe-word-text">${wordHtml}${isCustomWord(r.word) ? '<span class="custom-word-badge">(kata kustom)</span>' : ''}</span>
      ${badge}
    </div>`;
  }).join('');
  if (visible.length > MAX_KOMPE_RENDER) {
    html += `<div class="push-empty">+${(visible.length - MAX_KOMPE_RENDER).toLocaleString('id-ID')} kata lagi, persempit pencarian.</div>`;
  }
  container.innerHTML = html;
}

// Buat kolom "Trigger Trap": 1 baris per grup aktif (mode sekarang), diurut
// weight terbesar -> terkecil. Tiap grup cuma nyodorin 1 kata trigger yang
// paling pendek & belum dipake; kata trigger lain di grup yang sama nongol
// gantian abis kata terpendek ini diklik/dipake.
function computeKompeTriggerRows(query) {
  const groupsInMode = kompeGroups.filter(g => g.mode === kompeMode);
  const rows = [];
  groupsInMode.forEach(g => {
    const candidates = g.triggers.filter(w => w.startsWith(query) && !kompeUsedWords.has(w) && !blockedSet.has(w));
    if (!candidates.length) return;
    candidates.sort((a, b) => a.length - b.length || a.localeCompare(b));
    rows.push({ id: g.id, segment: g.segment, weight: g.weight, word: candidates[0], remaining: candidates.length - 1 });
  });
  return sortKompeGroupsByPriority(rows, r => r.id, r => r.weight, r => r.segment);
}

// Bangun HTML kata dengan highlight per-karakter: bagian yang cocok sama
// query (prefix yang lagi diketik) dikasih warna "key", bagian yang cocok
// sama segmen trigger grup dikasih warna "segment" (prioritas di atas key
// kalau ada tumpang tindih), sisanya warna teks biasa.
function buildHighlightedWordHtml(word, cut, segment) {
  const n = word.length;
  const cls = new Array(n).fill('post');
  for (let i = 0; i < Math.min(cut, n); i++) cls[i] = 'key';
  if (segment) {
    const idx = word.indexOf(segment);
    if (idx !== -1) {
      for (let i = idx; i < idx + segment.length && i < n; i++) cls[i] = 'segment';
    }
  }
  const classMap = { key: 'kompe-word-key', segment: 'kompe-word-segment', post: 'kompe-word-post' };
  let html = '';
  let i = 0;
  while (i < n) {
    const c = cls[i];
    let j = i;
    while (j < n && cls[j] === c) j++;
    html += `<span class="${classMap[c]}">${escapeHtml(word.slice(i, j))}</span>`;
    i = j;
  }
  return html;
}

function renderKompeTriggerList(query) {
  const container = document.getElementById('kompeTriggerList');
  if (!container) return;
  if (!query) {
    container.innerHTML = '<div class="push-empty">Ketik awalan kata di atas buat mulai...</div>';
    return;
  }
  const rows = computeKompeTriggerRows(query);
  if (!rows.length) {
    container.innerHTML = '<div class="push-empty">Ga ada trigger yang cocok.</div>';
    return;
  }
  const html = rows.map(r => {
    const wordHtml = buildHighlightedWordHtml(r.word, 0, r.segment);
    const remainingBadge = r.remaining > 0 ? `<span class="kompe-remaining-badge" title="${r.remaining} kata trigger lain nunggu giliran">+${r.remaining}</span>` : '';
    return `<div class="kompe-word kompe-trigger-word" data-kompe-word="${escapeHtml(r.word)}" title="trigger: ${escapeHtml(r.segment)}">
      <span class="kompe-word-text">${wordHtml}${isCustomWord(r.word) ? '<span class="custom-word-badge">(kata kustom)</span>' : ''}</span>
      <span class="kompe-trigger-meta">
        ${remainingBadge}
      </span>
    </div>`;
  }).join('');
  container.innerHTML = html;
}

function applyKompeModeVisibility() {
  const isTrap = kompeMode === 'trap';
  document.getElementById('kompeSearchWrap').style.display = isTrap ? 'none' : '';
  document.getElementById('kompeBoard').style.display = isTrap ? 'none' : '';
  document.getElementById('kompeTrapPanel').style.display = isTrap ? '' : 'none';
  document.getElementById('kompeBuatGrupBtn').style.display = isTrap ? 'none' : '';
  document.getElementById('kompeKelolaTrapBtn').style.display = isTrap ? '' : 'none';
  document.getElementById('kompeBukaPresetBtn').style.display = isTrap ? 'none' : '';
  const label = document.getElementById('kompePresetCurrentLabel');
  if (isTrap) {
    if (label) label.style.display = 'none';
  } else {
    const activePreset = getActiveKompePreset(kompeMode);
    if (label) {
      label.style.display = '';
      label.innerHTML = activePreset ? `preset aktif: <b>${escapeHtml(activePreset.name)}</b>` : '';
    }
  }
}

function renderKompe() {
  applyKompeModeVisibility();
  if (kompeMode === 'trap') {
    renderTrapResults();
    return;
  }
  renderKompeGroupList();
  const query = document.getElementById('kompeSearchInput').value.trim().toLowerCase();
  renderKompeWordResults(query);
  renderKompeTriggerList(query);
}

function renderTrapResults() {
  const results = computeTrapCandidates();
  lastTrapResults = results;
  const summary = document.getElementById('trapResultSummary');
  const container = document.getElementById('trapResults');
  summary.textContent = `Ditemukan ${results.length.toLocaleString('id-ID')} kandidat suffix ${trapLength} huruf`;

  if (!results.length) {
    container.innerHTML = '<div class="push-empty">Ga ada kandidat yang cocok, coba longgarin filter.</div>';
    return;
  }

  const shown = results.slice(0, trapRenderLimit);
  let html = shown.map(r => {
    const active = isTrapWordActive(r.segment);
    const showPicker = trapAddPickerSegment === r.segment;
    const expanded = trapExpandedSegment === r.segment;
    const actionHtml = showPicker
      ? `<div class="kompe-trap-add-picker">
          <span class="kompe-trap-add-picker-label">Simpen ke:</span>
          <button data-trap-pick="normal" data-trap-pick-segment="${escapeHtml(r.segment)}">Normal</button>
          <button data-trap-pick="brutal" data-trap-pick-segment="${escapeHtml(r.segment)}">Brutal</button>
          <button class="kompe-trap-add-picker-cancel" data-trap-pick-cancel="${escapeHtml(r.segment)}">✕</button>
        </div>`
      : `<button class="kompe-trap-item-add ${active ? 'added' : ''}" data-trap-add="${escapeHtml(r.segment)}" ${active ? 'disabled' : ''}>${active ? '✓ Ditambah' : '+ Tambah'}</button>`;
    let expandPanel = '';
    if (expanded) {
      const { triggers, counters } = getTrapWordLists(r.segment);
      expandPanel = `<div class="kompe-trap-expand-panel">
        <div class="kelola-trap-card-col">
          <div class="kelola-trap-card-col-title">Counter/Solve (${counters.length})</div>
          <div class="kelola-trap-card-words">${counters.map(w => `<span class="kompe-trap-word-chip">${escapeHtml(w)}</span>`).join('') || '<span class="kompe-modal-empty">—</span>'}</div>
        </div>
        <div class="kelola-trap-card-col">
          <div class="kelola-trap-card-col-title">Trigger (${triggers.length})</div>
          <div class="kelola-trap-card-words">${triggers.map(w => `<span class="kompe-trap-word-chip">${escapeHtml(w)}</span>`).join('') || '<span class="kompe-modal-empty">—</span>'}</div>
        </div>
      </div>`;
    }
    return `<div class="kompe-trap-item-wrap">
      <div class="kompe-trap-item">
        <div>
          <div class="kompe-trap-item-word">${escapeHtml(r.segment)}</div>
          <div class="kompe-trap-item-stats"><span>trigger: <b>${r.triggerCount.toLocaleString('id-ID')}</b></span><span>solve: <b>${r.counterCount.toLocaleString('id-ID')}</b></span></div>
        </div>
        <button class="kompe-trap-item-expand-btn ${expanded ? 'open' : ''}" data-trap-expand="${escapeHtml(r.segment)}" title="Lihat trigger/counter"><span class="icon-chevron ${expanded ? 'icon-chevron-up' : ''}"></span></button>
        ${actionHtml}
      </div>
      ${expandPanel}
    </div>`;
  }).join('');
  if (results.length > trapRenderLimit) {
    html += `<div class="push-empty">Muncul ${trapRenderLimit} dari ${results.length.toLocaleString('id-ID')} kandidat, scroll buat lebih banyak...</div>`;
  }
  container.innerHTML = html;
}

// Suffix 4-5 huruf -> auto kesimpen ke mode Brutal (Normal maks 3 huruf, ga nampung).
// Suffix 2-3 huruf -> dua-duanya valid, jadi ditangani lewat picker di renderTrapResults.
async function addSegmentAsTrapGroup(segment, groupMode) {
  const res = await submitKompeGroup(segment, groupMode, 0);
  showToast(res.ok ? `🪤 "${segment}" ditambah ke Mode ${groupMode === 'brutal' ? 'Brutal' : 'Normal'}` : res.msg);
  if (res.ok) {
    renderTrapResults();
    if (document.getElementById('kelolaTrapModal').classList.contains('show')) renderKelolaTrapModal();
  }
}

function renderKelolaTrapModal() {
  document.querySelectorAll('.kelola-trap-tab').forEach(b => b.classList.toggle('active', b.dataset.kelolaTab === kelolaTrapActiveTab));
  const input = document.getElementById('kelolaTrapInput');
  if (input) input.maxLength = kelolaTrapActiveTab === 'brutal' ? 5 : 3;

  const list = document.getElementById('kelolaTrapList');
  const inTab = kompeGroups.filter(g => g.mode === kelolaTrapActiveTab);
  if (!inTab.length) {
    list.innerHTML = `<div class="hint" style="text-align:center; padding:20px 0;">Belum ada trap aktif di Mode ${kelolaTrapActiveTab === 'brutal' ? 'Brutal' : 'Normal'}.</div>`;
    return;
  }
  const sorted = [...inTab].sort((a, b) => b.weight - a.weight);
  list.innerHTML = sorted.map(g => {
    const triggerWords = g.triggers.filter(w => !kompeUsedWords.has(w));
    const counterWords = g.counters.filter(w => !kompeUsedWords.has(w));
    return `<div class="kelola-trap-card">
      <div class="kelola-trap-card-head">
        <span class="kelola-trap-card-word">${escapeHtml(g.segment)}</span>
        <span class="kelola-trap-card-count">${triggerWords.length}<span class="sep">/</span>${counterWords.length}</span>
        <button class="kompe-btn ghost danger kelola-trap-card-del" data-untrap="${g.id}" title="Hapus Grup">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

function clearKompeSearch() {
  const input = document.getElementById('kompeSearchInput');
  if (input) input.value = '';
}

const debouncedKompeSearch = debounce((query) => {
  renderKompeWordResults(query);
  renderKompeTriggerList(query);
}, 150);

document.getElementById('kompeSearchInput').addEventListener('input', e => {
  debouncedKompeSearch(e.target.value.trim().toLowerCase());
});

document.getElementById('kompeContent').addEventListener('click', e => {
  const row = e.target.closest('[data-kompe-word]');
  if (!row) return;
  kompeUsedWords.add(row.dataset.kompeWord);
  const query = document.getElementById('kompeSearchInput').value.trim().toLowerCase();
  renderKompeWordResults(query);
  renderKompeTriggerList(query);
});

const MAX_MODAL_PREVIEW = 100;

function renderModalPreviewList(el, words) {
  if (!words.length) {
    el.innerHTML = '<div class="kompe-modal-empty">Ga ada.</div>';
    return;
  }
  const shown = words.slice(0, MAX_MODAL_PREVIEW);
  let html = shown.map(w => `<div>${escapeHtml(w)}</div>`).join('');
  if (words.length > MAX_MODAL_PREVIEW) {
    html += `<div class="kompe-modal-empty">+${(words.length - MAX_MODAL_PREVIEW).toLocaleString('id-ID')} kata lagi...</div>`;
  }
  el.innerHTML = html;
}

function renderKompeModalPreview() {
  const input = document.getElementById('kompeModalInput');
  const segment = input.value.trim().toLowerCase();
  const triggerCountEl = document.getElementById('kompeModalTriggerCount');
  const counterCountEl = document.getElementById('kompeModalCounterCount');
  const triggerPreview = document.getElementById('kompeModalTriggerPreview');
  const counterPreview = document.getElementById('kompeModalCounterPreview');

  if (!segment) {
    triggerCountEl.textContent = '0';
    counterCountEl.textContent = '0';
    triggerPreview.innerHTML = '<div class="kompe-modal-empty"></div>';
    counterPreview.innerHTML = '';
    return;
  }

  const triggers = DICTIONARY.filter(w => w.endsWith(segment) && w !== segment && !blockedSet.has(w));
  const counters = DICTIONARY.filter(w => w.startsWith(segment) && w !== segment && !blockedSet.has(w));

  triggerCountEl.textContent = triggers.length.toLocaleString('id-ID');
  counterCountEl.textContent = counters.length.toLocaleString('id-ID');

  renderModalPreviewList(triggerPreview, triggers);
  renderModalPreviewList(counterPreview, counters);
}

const debouncedModalPreview = debounce(renderKompeModalPreview, 150);

let kompeModalSelectedMode = null;

function setKompeModalMode(m) {
  kompeModalSelectedMode = m;
  document.querySelectorAll('.kompe-modal-mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.modalMode === m);
  });
  const input = document.getElementById('kompeModalInput');
  const charCount = document.getElementById('kompeModalCharCount');
  if (!m) {
    input.disabled = true;
    input.value = '';
    input.placeholder = 'pilih mode dulu...';
    charCount.textContent = '';
    renderKompeModalPreview();
    return;
  }
  const maxLen = m === 'brutal' ? 5 : 3;
  input.disabled = false;
  input.maxLength = maxLen;
  input.placeholder = `ketik segmen kata (maks. ${maxLen} huruf)...`;
  if (input.value.length > maxLen) input.value = input.value.slice(0, maxLen);
  charCount.textContent = `${input.value.length}/${maxLen}`;
  renderKompeModalPreview();
  input.focus();
}

document.querySelectorAll('.kompe-modal-mode-btn').forEach(btn => {
  btn.addEventListener('click', () => setKompeModalMode(btn.dataset.modalMode));
});

function openKompeModal() {
  document.getElementById('kompeModalWeight').value = '0';
  setKompeModalMode(null);
  document.getElementById('kompeGroupModal').classList.add('show');
}

document.getElementById('kompeBuatGrupBtn').addEventListener('click', openKompeModal);

document.getElementById('closeKompeGroupModal').addEventListener('click', () => {
  document.getElementById('kompeGroupModal').classList.remove('show');
});

document.getElementById('kompeModalInput').addEventListener('input', e => {
  const maxLen = kompeModalSelectedMode === 'brutal' ? 5 : 3;
  if (e.target.value.length > maxLen) e.target.value = e.target.value.slice(0, maxLen);
  document.getElementById('kompeModalCharCount').textContent = kompeModalSelectedMode ? `${e.target.value.length}/${maxLen}` : '';
  debouncedModalPreview();
});

document.getElementById('kompeModalInput').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  document.getElementById('kompeModalSubmitBtn').click();
});

document.getElementById('kompeModalWeight').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  document.getElementById('kompeModalSubmitBtn').click();
});

document.getElementById('kompeModalSubmitBtn').addEventListener('click', async () => {
  // FIX: dulu baris ini manggil document.getElementById('kompeModalMode').value,
  // padahal select itu udah diganti tombol .kompe-modal-mode-btn -> pake state kompeModalSelectedMode
  const groupMode = kompeModalSelectedMode;
  if (!groupMode) { showToast('⚠️ pilih mode dulu bro'); return; }

  const input = document.getElementById('kompeModalInput');
  const segment = input.value.trim().toLowerCase();
  if (!segment) { showToast('⚠️ isi box input dulu bro'); return; }

  const weight = document.getElementById('kompeModalWeight').value;
  const res = await submitKompeGroup(segment, groupMode, weight);
  if (!res.ok) { showToast(res.msg); return; }

  if (groupMode !== kompeMode) {
    document.querySelectorAll('.kompe-mode').forEach(b => b.classList.toggle('active', b.dataset.kompeMode === groupMode));
    kompeMode = groupMode;
  }
  renderKompe();
  document.getElementById('kompeGroupModal').classList.remove('show');
  showToast(res.msg);
});

document.getElementById('kompeResetBtn').addEventListener('click', () => {
  if (!kompeUsedWords.size && !kompePinnedGroupIds.length) return;
  const ok = window.confirm('Reset kata yang udah di-klik/di-hide dan prioritas grup? Grup trap-nya sendiri ga bakal kehapus.');
  if (!ok) return;
  kompeUsedWords.clear();
  kompePinnedGroupIds = [];
  renderKompe();
  showToast('List dan prioritas direset, grup tetap aman');
});

document.querySelectorAll('.kompe-mode').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.kompe-mode').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    kompeMode = btn.dataset.kompeMode;
    clearKompeSearch();
    trapAddPickerSegment = null;
    if (kompeMode === 'trap') trapRenderLimit = TRAP_RENDER_STEP;
    renderKompe();
  });
});

// ---- Trap explore panel ----
document.querySelectorAll('.kompe-trap-len-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.kompe-trap-len-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    trapLength = Number(btn.dataset.trapLen);
    const counterMinEl = document.getElementById('trapCounterMin');
    const counterMaxEl = document.getElementById('trapCounterMax');
    const triggerMinEl = document.getElementById('trapTriggerMin');
    const triggerMaxEl = document.getElementById('trapTriggerMax');
    triggerMinEl.value = '';
    triggerMaxEl.value = '';
    if (trapLength >= 4) {
      counterMinEl.value = '2';
      counterMaxEl.value = '3';
    } else {
      counterMinEl.value = '';
      counterMaxEl.value = '';
    }
    trapRenderLimit = TRAP_RENDER_STEP;
    renderTrapResults();
  });
});

const debouncedTrapFilter = debounce(() => {
  trapRenderLimit = TRAP_RENDER_STEP;
  renderTrapResults();
}, 150);
['trapTriggerMin', 'trapTriggerMax', 'trapCounterMin', 'trapCounterMax'].forEach(id => {
  document.getElementById(id).addEventListener('input', debouncedTrapFilter);
});

document.getElementById('trapResults').addEventListener('click', async e => {
  const expandBtn = e.target.closest('[data-trap-expand]');
  if (expandBtn) {
    const segment = expandBtn.dataset.trapExpand;
    trapExpandedSegment = trapExpandedSegment === segment ? null : segment;
    renderTrapResults();
    return;
  }
  const addBtn = e.target.closest('[data-trap-add]');
  if (addBtn && !addBtn.disabled) {
    const segment = addBtn.dataset.trapAdd;
    if (segment.length >= 4) {
      // suffix 4-5 huruf: Normal ga nampung (maks 3 huruf), jadi langsung Brutal
      await addSegmentAsTrapGroup(segment, 'brutal');
    } else {
      // suffix 2-3 huruf: dua mode valid, munculin picker dulu
      trapAddPickerSegment = segment;
      renderTrapResults();
    }
    return;
  }
  const pickBtn = e.target.closest('[data-trap-pick]');
  if (pickBtn) {
    const segment = pickBtn.dataset.trapPickSegment;
    const groupMode = pickBtn.dataset.trapPick;
    trapAddPickerSegment = null;
    await addSegmentAsTrapGroup(segment, groupMode);
    return;
  }
  const cancelBtn = e.target.closest('[data-trap-pick-cancel]');
  if (cancelBtn) {
    trapAddPickerSegment = null;
    renderTrapResults();
  }
});

document.getElementById('kompeKelolaTrapBtn').addEventListener('click', () => {
  kelolaTrapActiveTab = 'normal';
  kelolaTrapOpenCardId = null;
  renderKelolaTrapModal();
  document.getElementById('kelolaTrapModal').classList.add('show');
});
document.getElementById('closeKelolaTrapModal').addEventListener('click', () => {
  document.getElementById('kelolaTrapModal').classList.remove('show');
});

document.querySelectorAll('.kelola-trap-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    kelolaTrapActiveTab = btn.dataset.kelolaTab;
    kelolaTrapOpenCardId = null;
    renderKelolaTrapModal();
  });
});

document.getElementById('kelolaTrapAddBtn').addEventListener('click', async () => {
  const input = document.getElementById('kelolaTrapInput');
  const segment = input.value.trim().toLowerCase();
  const statsEl = document.getElementById('kelolaTrapStats');
  const maxLen = kelolaTrapActiveTab === 'brutal' ? 5 : 3;
  if (segment.length < 2 || segment.length > maxLen) {
    statsEl.textContent = `Segmen trap Mode ${kelolaTrapActiveTab === 'brutal' ? 'Brutal' : 'Normal'} harus 2-${maxLen} huruf.`;
    return;
  }
  if (kompeGroups.some(g => g.segment === segment && g.mode === kelolaTrapActiveTab)) {
    statsEl.textContent = 'Segmen ini udah ada di tab ini.';
    return;
  }
  const res = await submitKompeGroup(segment, kelolaTrapActiveTab, 0);
  if (!res.ok) { statsEl.textContent = res.msg; return; }
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  statsEl.textContent = '';
  renderKelolaTrapModal();
  if (kompeMode === 'trap') renderTrapResults();
  else if (kompeMode === kelolaTrapActiveTab) renderKompe();
});
document.getElementById('kelolaTrapInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('kelolaTrapAddBtn').click();
  }
});

document.getElementById('kelolaTrapList').addEventListener('click', async e => {
  const delBtn = e.target.closest('[data-untrap]');
  if (delBtn) {
    const id = delBtn.dataset.untrap;
    const group = kompeGroups.find(g => g.id === id);
    const ok = window.confirm(`Hapus grup "${group ? group.segment : ''}"? Ga bisa dibalikin.`);
    if (!ok) return;
    kompeGroups = kompeGroups.filter(g => g.id !== id);
    if (kompeActiveGroupId === id) kompeActiveGroupId = null;
    if (kompeExpandedGroupId === id) kompeExpandedGroupId = null;
    await saveKompeGroups();
    renderKelolaTrapModal();
    if (kompeMode === 'trap') renderTrapResults();
    else renderKompe();
  }
});

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    if (tab.classList.contains('disabled')) {
      showToast('Mode ini masih dalam pengerjaan bro 🚧');
      return;
    }
    switchTab(tab.dataset.tab);
  });
});

document.querySelectorAll('.view-toggle button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.view-toggle button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    view = btn.dataset.view;
    render();
  });
});
document.getElementById('sortSelect').addEventListener('change', e => {
  sortMode = e.target.value;
  renderLimit = RENDER_STEP;
  render();
});
document.getElementById('favChip').addEventListener('click', () => {
  favOnly = !favOnly;
  document.getElementById('favChip').classList.toggle('on', favOnly);
  renderLimit = RENDER_STEP;
  render();
});

document.getElementById('blockedChip').addEventListener('click', () => {
  renderBlockedModal();
  document.getElementById('blockedModal').classList.add('show');
});
document.getElementById('closeBlockedModal').addEventListener('click', () => {
  document.getElementById('blockedModal').classList.remove('show');
});

document.getElementById('customWordsChip').addEventListener('click', () => {
  customOnly = !customOnly;
  document.getElementById('customWordsChip').classList.toggle('on', customOnly);
  renderLimit = RENDER_STEP;
  render();
});

window.downloadBlockedWords = function () {
  if (blocked.length === 0) {
    console.warn('Belum ada kata yang diblokir.');
    return;
  }
  const content = blocked.join('\n');
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'kata-diblokir.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  console.log(`✅ ${blocked.length} kata diblokir berhasil diunduh.`);
};
window.downloadCustomWords = function () {
  if (customWords.length === 0) {
    console.warn('Belum ada kata kustom.');
    return;
  }
  const content = [...customWords].sort().join('\n');
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'kata-kustom.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  console.log(`✅ ${customWords.length} kata kustom berhasil diunduh.`);
};
window.downloadPushedWords = function () {
  if (pushedWords.length === 0) {
    console.warn('Belum ada kata yang di-push.');
    return;
  }
  const content = pushedWords.join('\n');
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'kata-terpush.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  console.log(`✅ ${pushedWords.length} kata terpush berhasil diunduh.`);
};
function renderBlockedModal() {
  const list = document.getElementById('blockedList');
  if (blocked.length === 0) {
    list.innerHTML = '<div class="hint" style="text-align:center; padding:20px 0;">Belum ada kata yang diblokir.</div>';
    return;
  }
  list.innerHTML = blocked.map(w => `
    <div class="blocked-item">
      <span>${escapeHtml(w)}</span>
      <button data-unblock="${escapeHtml(w)}">Buka blokir</button>
    </div>
  `).join('');
  list.querySelectorAll('button[data-unblock]').forEach(b => {
    b.addEventListener('click', () => {
      blocked = blocked.filter(w => w !== b.dataset.unblock);
      blockedSet = new Set(blocked);
      saveBlocked();
      renderBlockedModal();
      render();
    });
  });
}

// Beda sama tombol admin unblockAllBtn/unblockAllCustomBtn di panel review
// (itu buat data yang direport ke server, lintas user). Ini cuma buat daftar
// blocked LOKAL milik user sendiri di device ini.
document.getElementById('unblockAllLocalBtn').addEventListener('click', async () => {
  if (blocked.length === 0) { showToast('⚠️ belum ada kata yang diblokir'); return; }
  const ok = window.confirm(`Batalkan semua ${blocked.length.toLocaleString('id-ID')} kata yang diblokir? Semua kata bakal muncul lagi di pencarian. Ga bisa dibalikin satu-satu -- kalau berubah pikiran, cuma bisa numpuk lagi dari blokir manual.`);
  if (!ok) return;
  blocked = [];
  blockedSet = new Set();
  letterStats = null;
  await saveBlocked();
  renderBlockedModal();
  render();
  if (document.getElementById('pushView').classList.contains('active')) renderPushIndex();
  showToast('🗑️ semua blokiran dibatalkan');
});

document.getElementById('dbToggle').addEventListener('click', () => {
  document.getElementById('dbTotal').textContent = DICTIONARY.length.toLocaleString('id-ID');
  document.getElementById('dbFav').textContent = favorites.length;
  document.getElementById('dbBlocked').textContent = blocked.length;
  document.getElementById('dbPushed').textContent = getPushedInDictCount().toLocaleString('id-ID');
  document.getElementById('dbModal').classList.add('show');
});
document.getElementById('closeDbModal').addEventListener('click', () => {
  document.getElementById('dbModal').classList.remove('show');
});

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) {
      overlay.classList.remove('show');
      if (overlay.id === 'caraBermainModal') applyGuideVisibility();
    }
  });
});

document.getElementById('importInfoIcon').addEventListener('click', () => {
  document.getElementById('importInfoModal').classList.add('show');
});
document.getElementById('closeImportInfoModal').addEventListener('click', () => {
  document.getElementById('importInfoModal').classList.remove('show');
});

function highlightWord(word) {
  const safe = escapeHtml(word);
  if (mode === 'awalan' && query.awalan) {
    if (word.startsWith(query.awalan)) {
      return `<span class="hit">${escapeHtml(word.slice(0, query.awalan.length))}</span>${escapeHtml(word.slice(query.awalan.length))}`;
    }
  }
  if (mode === 'akhiran' && query.akhiran) {
    if (word.endsWith(query.akhiran)) {
      const cut = word.length - query.akhiran.length;
      return `${escapeHtml(word.slice(0, cut))}<span class="hit">${escapeHtml(word.slice(cut))}</span>`;
    }
  }
  if (mode === 'both') {
    if (query.awalan && word.startsWith(query.awalan) && query.akhiran && word.endsWith(query.akhiran)) {
      const cut = word.length - query.akhiran.length;
      if (cut >= query.awalan.length) {
        return `<span class="hit">${escapeHtml(word.slice(0, query.awalan.length))}</span>${escapeHtml(word.slice(query.awalan.length, cut))}<span class="hit">${escapeHtml(word.slice(cut))}</span>`;
      }
    }
    return safe;
  }
  if (mode === 'mengandung' && query.mengandung) {
    const idx = word.indexOf(query.mengandung);
    if (idx !== -1) {
      return `${escapeHtml(word.slice(0, idx))}<span class="hit">${escapeHtml(word.slice(idx, idx + query.mengandung.length))}</span>${escapeHtml(word.slice(idx + query.mengandung.length))}`;
    }
  }
  return safe;
}

function getFiltered() {
  let list;

  // Kalau ada query awalan/akhiran, mulai dari bucket huruf yang relevan
  // (jauh lebih kecil dari 200rb+ kata) baru startsWith/endsWith di situ --
  // bukan scan DICTIONARY penuh kayak sebelumnya.
  if (mode === 'awalan' && query.awalan) {
    const bucket = dictByFirstLetter.get(query.awalan[0]) || [];
    list = bucket.filter(w => w.startsWith(query.awalan) && !blockedSet.has(w));
  } else if (mode === 'akhiran' && query.akhiran) {
    const bucket = dictByLastLetter.get(query.akhiran[query.akhiran.length - 1]) || [];
    list = bucket.filter(w => w.endsWith(query.akhiran) && !blockedSet.has(w));
  } else if (mode === 'both' && (query.awalan || query.akhiran)) {
    // Pilih bucket yang lebih selektif duluan (awalan kalau ada, kalau nggak akhiran),
    // baru filter syarat sisanya di atas hasil yang udah kepersempit.
    let base;
    if (query.awalan) base = dictByFirstLetter.get(query.awalan[0]) || [];
    else base = dictByLastLetter.get(query.akhiran[query.akhiran.length - 1]) || [];
    list = base.filter(w => {
      if (query.awalan && !w.startsWith(query.awalan)) return false;
      if (query.akhiran && !w.endsWith(query.akhiran)) return false;
      return !blockedSet.has(w);
    });
  } else if (mode === 'mengandung' && query.mengandung) {
    // Substring search gak bisa di-index sesederhana awalan/akhiran, tetep full scan.
    list = DICTIONARY.filter(w => w.includes(query.mengandung) && !blockedSet.has(w));
  } else {
    list = DICTIONARY.filter(w => !blockedSet.has(w));
  }

  if (favOnly) list = list.filter(w => favoritesSet.has(w));
  if (customOnly) list = list.filter(w => isCustomWord(w));

  switch (sortMode) {
    case 'az': list = [...list].sort((a, b) => a.localeCompare(b)); break;
    case 'za': list = [...list].sort((a, b) => b.localeCompare(a)); break;
    case 'short': list = [...list].sort((a, b) => a.length - b.length || a.localeCompare(b)); break;
    case 'long': list = [...list].sort((a, b) => b.length - a.length || a.localeCompare(b)); break;
    case 'random': list = shuffleArray(list); break;
  }
  list.sort((a, b) => Number(favoritesSet.has(b)) - Number(favoritesSet.has(a)));
  return list;
}

function render() {
  document.getElementById('totalWordCount').textContent = DICTIONARY.length.toLocaleString('id-ID');
  document.getElementById('blockedCount').textContent = blocked.length;

  const container = document.getElementById('results');
  container.className = 'search-section results ' + view;

  const hasQuery = (mode === 'awalan' && query.awalan) ||
    (mode === 'akhiran' && query.akhiran) ||
    (mode === 'both' && (query.awalan || query.akhiran)) ||
    (mode === 'mengandung' && query.mengandung);

  if (!hasQuery && !favOnly && !customOnly) {
    document.getElementById('resultCount').textContent = '0';
    container.innerHTML = `<div class="empty-state"><div class="big">T...</div>Ketik awalan atau akhiran dulu buat mulai nyari.</div>`;
    return;
  }

  const filtered = getFiltered();
  lastFiltered = filtered;
  document.getElementById('resultCount').textContent = filtered.length.toLocaleString('id-ID');

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="big">🔍</div>Ga ada kata yang cocok.<br>Coba ganti awalan/akhiran nya.</div>`;
    return;
  }

  const shown = filtered.slice(0, renderLimit);
  let html = shown.map(w => {
    const isFav = favorites.includes(w);
    const isPush = isPushed(w);
    const pushBtn = searchPushEnabled
      ? `<button class="push-check ${isPush ? 'on' : ''}" data-push="${escapeHtml(w)}" title="${isPush ? 'Batal push' : 'Push kata'}">${CHECK_ICON_SVG}</button>`
      : '';
    return `
      <div class="word-card">
        <div class="word-main">
          <div class="word-text">${highlightWord(w)}${isCustomWord(w) ? '<span class="custom-word-badge">(kata kustom)</span>' : ''}</div>
          <div class="letter-count">${w.length} huruf</div>
        </div>
        <div class="word-actions">
          ${pushBtn}
          <button class="copy" data-copy="${escapeHtml(w)}" title="Copy kata">${COPY_ICON_SVG}</button>
          <button class="star ${isFav ? 'on' : ''}" data-fav="${escapeHtml(w)}" title="Favorit">★</button>
          <button class="block" data-block="${escapeHtml(w)}" title="Blokir">✕</button>
        </div>
      </div>
    `;
  }).join('');

  if (filtered.length > renderLimit) {
    html += `<div class="empty-state" style="padding:16px;">Muncul ${renderLimit} dari ${filtered.length.toLocaleString('id-ID')} kata, scroll buat lebih banyak...</div>`;
  }
  container.innerHTML = html;
}

document.getElementById('results').addEventListener('click', (e) => {
  const copyBtn = e.target.closest('button[data-copy]');
  if (copyBtn) {
    copyWordToClipboard(copyBtn.dataset.copy);
    return;
  }
  const favBtn = e.target.closest('button[data-fav]');
  if (favBtn) {
    const w = favBtn.dataset.fav;
    if (favorites.includes(w)) favorites = favorites.filter(x => x !== w);
    else { favorites.push(w); showToast('⭐ ditambah ke favorit'); }
    favoritesSet = new Set(favorites);
    saveFavorites();
    render();
    return;
  }
  const pushBtn = e.target.closest('button[data-push]');
  if (pushBtn) {
    const w = pushBtn.dataset.push;
    if (isPushed(w)) {
      pushedWords = pushedWords.filter(pw => pw !== w);
    } else {
      pushedWords.push(w);
      pushUndoStack.push({ type: 'push', words: [w] });
      if (pushUndoStack.length > PUSH_UNDO_LIMIT) pushUndoStack.shift();
      updatePushUndoBtn();
    }
    pushedSet = new Set(pushedWords);
    letterStats = null;
    savePushedWords();
    render();
    return;
  }
  const blockBtn = e.target.closest('button[data-block]');
  if (blockBtn) {
    const w = blockBtn.dataset.block;
    if (customWordsSet.has(w)) {
      customWords = customWords.filter(cw => cw !== w);
      if (!baseDictSet.has(w)) DICTIONARY = DICTIONARY.filter(dw => dw !== w);
      pushedWords = pushedWords.filter(pw => pw !== w);
      rebuildCaches();
      pushUndoStack.push({ type: 'customDelete', words: [w] });
      if (pushUndoStack.length > PUSH_UNDO_LIMIT) pushUndoStack.shift();
      updatePushUndoBtn();
      saveCustomWords();
      savePushedWords();
      showToast(`"${w}" dihapus dari kata kustom`);
      render();
      return;
    }
    blocked.push(w);
    blockedSet.add(w);
    pushUndoStack.push({ type: 'block', words: [w] });
    if (pushUndoStack.length > PUSH_UNDO_LIMIT) pushUndoStack.shift();
    updatePushUndoBtn();
    saveBlocked();
    checkAndReportWords();
    letterStats = null;
    showToast(`🚫 ${w} diblokir`);
    render();
  }
});

document.getElementById('addWordBtn').addEventListener('click', () => {
  const input = document.getElementById('addWordInput');
  input.value = '';
  document.getElementById('addWordModal').classList.add('show');
  setTimeout(() => input.focus(), 50);
});
document.getElementById('closeAddWordModal').addEventListener('click', () => {
  document.getElementById('addWordModal').classList.remove('show');
});
document.getElementById('addWordInput').addEventListener('keydown', async e => {
  if (e.key === 'Escape') {
    document.getElementById('addWordModal').classList.remove('show');
    return;
  }
  if (e.key !== 'Enter') return;
  const val = e.target.value.trim().toLowerCase();
  if (!val) return;
  if (!SAFE_WORD_PATTERN.test(val)) {
    showToast('⚠️ kata cuma boleh huruf a-z, 2-86 karakter, tanpa spasi/simbol');
    return;
  }
  if (dictSet.has(val)) {
    showToast('⚠️ kata sudah ada di kamus');
    return;
  }
  customWords.push(val);
  DICTIONARY.push(val);
  DICTIONARY.sort();
  rebuildCaches();
  await saveCustomWords();
  checkAndReportWords();
  showToast(`"${val}" ditambahkan ke kamus`);
  e.target.value = '';
  e.target.dispatchEvent(new Event('input', { bubbles: true }));
  render();
  document.getElementById('totalWordCount').textContent = DICTIONARY.length.toLocaleString('id-ID');
});

async function loadSizeSettings() {
  const tileVal = await storageGet('samkat_tile_size');
  const wordVal = await storageGet('samkat_word_size');

  const tileSlider = document.getElementById('tileSizeSlider');
  const wordSlider = document.getElementById('wordSizeSlider');

  if (tileVal) {
    const clamped = Math.min(Number(tileSlider.max), Math.max(Number(tileSlider.min), Number(tileVal)));
    document.documentElement.style.setProperty('--index-tile-min', clamped + 'px');
    tileSlider.value = clamped;
  }
  if (wordVal) {
    const clamped = Math.min(Number(wordSlider.max), Math.max(Number(wordSlider.min), Number(wordVal)));
    document.documentElement.style.setProperty('--word-text-size', clamped + 'px');
    wordSlider.value = clamped;
  }
}
document.getElementById('tileSizeSlider').addEventListener('input', async e => {
  document.documentElement.style.setProperty('--index-tile-min', e.target.value + 'px');
  await storageSet('samkat_tile_size', e.target.value);
});
document.getElementById('wordSizeSlider').addEventListener('input', async e => {
  document.documentElement.style.setProperty('--word-text-size', e.target.value + 'px');
  await storageSet('samkat_word_size', e.target.value);
});
loadSizeSettings();

function parseDictionaryFile(text, filename) {
  const isJson = filename.toLowerCase().endsWith('.json');
  let words = [];
  if (isJson) {
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (e) { showToast('⚠️ gagal baca file json'); return null; }
    if (parsed && parsed.indexedDB && Array.isArray(parsed.indexedDB.words)) {
      words = parsed.indexedDB.words;
    } else if (Array.isArray(parsed)) {
      words = parsed;
    } else if (parsed && Array.isArray(parsed.words)) {
      words = parsed.words;
    } else if (parsed && Array.isArray(parsed.pushedWords)) {
      showToast('⚠️ itu file progress push, bukan kamus. Pake tombol Import Progress ya');
      return null;
    } else {
      showToast('⚠️ format json kamus ga dikenali');
      return null;
    }
  } else {
    words = text.split(/\r?\n/);
  }
  return words.map(w => String(w).trim().toLowerCase()).filter(Boolean).filter(w => SAFE_WORD_PATTERN.test(w));
}
function parseProgressFile(text, filename) {
  const isJson = filename.toLowerCase().endsWith('.json');
  let words = [];
  if (isJson) {
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (e) { showToast('⚠️ gagal baca file json'); return null; }
    if (parsed && Array.isArray(parsed.pushedWords)) {
      words = parsed.pushedWords;
    } else if (Array.isArray(parsed)) {
      words = parsed;
    } else if (parsed && parsed.indexedDB) {
      showToast('⚠️ itu file kamus, bukan progress push. Pake tombol Import Kamus ya');
      return null;
    } else {
      showToast('⚠️ format json progress ga dikenali');
      return null;
    }
  } else {
    words = text.split(/\r?\n/);
  }
  return words.map(w => String(w).trim().toLowerCase()).filter(Boolean);
}
function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function todayStr() { return new Date().toISOString().slice(0, 10); }

document.getElementById('importKamusBtn').addEventListener('click', () => document.getElementById('importKamusFile').click());
document.getElementById('importKamusFile').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    const words = parseDictionaryFile(reader.result, file.name);
    e.target.value = '';
    if (!words) return;
    const before = DICTIONARY.length;
    const newWords = words.filter(w => !dictSet.has(w));
    customWords = Array.from(new Set([...customWords, ...newWords]));
    DICTIONARY = Array.from(new Set([...DICTIONARY, ...newWords])).sort();
    rebuildCaches();
    await saveCustomWords();
    showToast(`kamus diperbarui, +${DICTIONARY.length - before} kata baru (${DICTIONARY.length.toLocaleString('id-ID')} total)`);
    document.getElementById('dbTotal').textContent = DICTIONARY.length.toLocaleString('id-ID');
    render();
    if (document.getElementById('pushView').classList.contains('active')) renderPushIndex();
  };
  reader.readAsText(file);
});

document.getElementById('importProgressBtn').addEventListener('click', () => document.getElementById('importProgressFile').click());
document.getElementById('importProgressFile').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    const words = parseProgressFile(reader.result, file.name);
    e.target.value = '';
    if (!words) return;

    pushedWords = Array.from(new Set(words));
    rebuildCaches();
    const removed = pruneStalePushedWords(true);
    await savePushedWords();
    const msg = removed
      ? `✅ progress diganti (${pushedWords.length.toLocaleString('id-ID')} kata, ${removed.toLocaleString('id-ID')} kata ga ada di kamus dibuang)`
      : `✅ progress diganti dengan file baru (${pushedWords.length.toLocaleString('id-ID')} kata)`;
    showToast(msg);
    document.getElementById('dbPushed').textContent = getPushedInDictCount().toLocaleString('id-ID');
    if (document.getElementById('pushView').classList.contains('active')) renderPushIndex();
  };
  reader.readAsText(file);
});

document.getElementById('exportKamusJsonBtn').addEventListener('click', () => {
  const data = { indexedDB: { name: 'samkat-dictionary', words: DICTIONARY } };
  downloadBlob(JSON.stringify(data, null, 2), `samkat-kamus-${todayStr()}.json`, 'application/json');
  showToast('kamus diexport (.json)');
});
document.getElementById('exportKamusTxtBtn').addEventListener('click', () => {
  downloadBlob(DICTIONARY.join('\n'), `samkat-kamus-${todayStr()}.txt`, 'text/plain');
  showToast('kamus diexport (.txt)');
});
document.getElementById('exportProgressJsonBtn').addEventListener('click', () => {
  downloadBlob(JSON.stringify({ pushedWords: pushedWords }, null, 2), `samkat-progress-${todayStr()}.json`, 'application/json');
  showToast('progress diexport (.json)');
});
document.getElementById('exportProgressTxtBtn').addEventListener('click', () => {
  downloadBlob(pushedWords.join('\n'), `samkat-progress-${todayStr()}.txt`, 'text/plain');
  showToast('progress diexport (.txt)');
});

// ---- Export / Import Trap (Preset Kompe) ----
document.getElementById('exportTrapJsonBtn').addEventListener('click', () => {
  downloadBlob(JSON.stringify(stripKompePresetsForStorage(kompePresets), null, 2), `samkat-trap-${todayStr()}.json`, 'application/json');
  showToast('trap diexport (.json)');
});

// Validasi struktur file import: harus ada normal[]/brutal[], tiap preset
// ada name + groups[], tiap grup ada segment/weight/mode. Kalau ga sesuai,
// return null (pemanggil yang nampilin toast error).
function parseTrapImportFile(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const isValidMode = list => Array.isArray(list) && list.every(p =>
    p && typeof p === 'object' &&
    typeof p.name === 'string' &&
    Array.isArray(p.groups) &&
    p.groups.every(g => g && typeof g.segment === 'string' && typeof g.weight !== 'undefined' && typeof g.mode === 'string')
  );
  const normal = Array.isArray(raw.normal) ? raw.normal : [];
  const brutal = Array.isArray(raw.brutal) ? raw.brutal : [];
  if ((raw.normal && !isValidMode(normal)) || (raw.brutal && !isValidMode(brutal))) return null;
  if (!normal.length && !brutal.length) return null;
  return { normal, brutal };
}

// Preset & grup dari file import selalu digenerate ID baru -- biar gak
// collision sama data lokal yang sekarang (apalagi kalau importnya dari
// akun/device lain). Isi datanya (nama, segmen, weight, mode) tetep dipertahanin.
function reidTrapPresets(list, fallbackMode) {
  return list.map(p => ({
    id: makeKompePresetId(),
    name: typeof p.name === 'string' && p.name.trim() ? p.name : 'Preset',
    groups: p.groups.map(g => {
      const group = computeKompeGroup(g.segment, g.weight, g.mode || fallbackMode);
      if (group) group.id = makeKompeGroupId();
      return group;
    }).filter(Boolean),
  }));
}

let pendingTrapImport = null;

document.getElementById('importTrapBtn').addEventListener('click', () => document.getElementById('importTrapFile').click());
document.getElementById('importTrapFile').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    e.target.value = '';
    const parsed = parseTrapImportFile(reader.result);
    if (!parsed) {
      showToast('⚠️ format json trap ga dikenali');
      return;
    }
    pendingTrapImport = parsed;
    const totalGroups = parsed.normal.reduce((n, p) => n + p.groups.length, 0) + parsed.brutal.reduce((n, p) => n + p.groups.length, 0);
    document.getElementById('importTrapSummaryText').textContent =
      `File ini isinya ${parsed.normal.length} preset Normal, ${parsed.brutal.length} preset Brutal (${totalGroups} grup total). Mau digabung ke preset yang ada, atau ganti semua?`;
    document.getElementById('importTrapModal').classList.add('show');
  };
  reader.readAsText(file);
});

document.getElementById('closeImportTrapModal').addEventListener('click', () => {
  document.getElementById('importTrapModal').classList.remove('show');
  pendingTrapImport = null;
});
document.getElementById('importTrapCancelBtn').addEventListener('click', () => {
  document.getElementById('importTrapModal').classList.remove('show');
  pendingTrapImport = null;
});

async function finishTrapImport() {
  document.getElementById('importTrapModal').classList.remove('show');
  pendingTrapImport = null;
  ensureDefaultKompePresets();
  rebuildKompeGroupsUnion();
  await saveKompePresetsMeta();
  if (document.getElementById('kompeView') && document.getElementById('kompeView').classList.contains('active')) renderKompe();
}

document.getElementById('importTrapMergeBtn').addEventListener('click', async () => {
  if (!pendingTrapImport) return;
  let skippedNormal = 0, skippedBrutal = 0;
  ['normal', 'brutal'].forEach(mode => {
    const incoming = reidTrapPresets(pendingTrapImport[mode], mode);
    const room = getMaxKompePresets() - kompePresets[mode].length;
    const toAdd = room === Infinity ? incoming : incoming.slice(0, Math.max(0, room));
    const skipped = incoming.length - toAdd.length;
    if (mode === 'normal') skippedNormal = skipped; else skippedBrutal = skipped;
    kompePresets[mode].push(...toAdd);
  });
  await finishTrapImport();
  const skipMsg = (skippedNormal || skippedBrutal)
    ? ` (${skippedNormal + skippedBrutal} preset ke-skip karena kena limit maks preset)`
    : '';
  showToast(`✅ trap digabung ke preset yang ada${skipMsg}`);
});

document.getElementById('importTrapRewriteBtn').addEventListener('click', async () => {
  if (!pendingTrapImport) return;
  ['normal', 'brutal'].forEach(mode => {
    if (!pendingTrapImport[mode].length) return; // mode yang kosong di file gaperlu nge-wipe yang sekarang
    const incoming = reidTrapPresets(pendingTrapImport[mode], mode);
    const room = getMaxKompePresets();
    const toKeep = room === Infinity ? incoming : incoming.slice(0, room);
    kompePresets[mode] = toKeep;
    kompeActivePresetId[mode] = toKeep.length ? toKeep[0].id : null;
  });
  await finishTrapImport();
  showToast('✅ semua preset diganti sama isi file');
});

window.addEventListener('scroll', () => {
  const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 400;
  if (!nearBottom) return;
  if (activeTab === 'pencarian' && lastFiltered.length > renderLimit) {
    renderLimit += RENDER_STEP;
    render();
  } else if (activeTab === 'push' && lastPushSorted.length > pushRenderLimit) {
    pushRenderLimit += PUSH_RENDER_STEP;
    renderPushIndex();
  } else if (activeTab === 'kompe' && kompeMode === 'trap' && lastTrapResults.length > trapRenderLimit) {
    trapRenderLimit += TRAP_RENDER_STEP;
    renderTrapResults();
  }
});

// ---- AUTH ----
const AUTH_API_BASE = 'https://sambungkatagx-api.gxjpeg.workers.dev';
let authToken = null;
let authUsername = null;

async function loadAuthSession() {
  const t = await storageGet('samkat_auth_token');
  const u = await storageGet('samkat_auth_username');
  if (t && u) {
    authToken = t;
    authUsername = u;
    updateAuthUI();
    await pullFromServer();
  }
}

const OWNER_USERNAME = 'gxjpeg2';
// Samain dengan REPORTED_WORDS_ACCESS di wrangler.jsonc (backend). Kalau nambah
// akun baru di sana, tambahin juga di sini biar tombolnya kelihatan di UI.
const REPORTED_WORDS_ACCESS_USERNAMES = ['gxjpeg2', 'lalalavienroselalala'];
function hasReportedWordsAccess(username) {
  return REPORTED_WORDS_ACCESS_USERNAMES.includes(username);
}

// Samain dengan PIN_RESET_ACCESS di wrangler.jsonc (backend). Sengaja dipisah
// dari REPORTED_WORDS_ACCESS -- daftar orang yang boleh reset PIN user lain
// beda level kepercayaan dari yang boleh liat reported-words.
const PIN_RESET_ACCESS_USERNAMES = ['gxjpeg2', 'lalalavienroselalala', 'lilylovely165'];
function hasPinResetAccess(username) {
  return PIN_RESET_ACCESS_USERNAMES.includes(username);
}

function updateAuthUI() {
  const navBtn = document.getElementById('authOpenBtn');
  const loggedOutView = document.getElementById('authLoggedOutView');
  const loggedInView = document.getElementById('authLoggedInView');
  const currentUsernameEl = document.getElementById('authCurrentUsername');
  const reportedBtn = document.getElementById('reportedWordsBtn');

  if (authToken) {
    navBtn.textContent = authUsername;
    navBtn.classList.add('logged-in');
    loggedOutView.style.display = 'none';
    loggedInView.style.display = 'block';
    currentUsernameEl.textContent = authUsername;
    const canReportedWords = hasReportedWordsAccess(authUsername);
    const canPinReset = hasPinResetAccess(authUsername);
    document.getElementById('adminPanel').style.display = (canReportedWords || canPinReset) ? 'flex' : 'none';
    document.getElementById('reportedWordsBtn').style.display = canReportedWords ? '' : 'none';
    document.getElementById('backfillReportedBtn').style.display = canReportedWords ? '' : 'none';
    document.getElementById('unblockAllBtn').style.display = canReportedWords ? '' : 'none';
    document.getElementById('unblockAllCustomBtn').style.display = canReportedWords ? '' : 'none';
    document.getElementById('pinResetBtn').style.display = canPinReset ? '' : 'none';
  } else {
    navBtn.textContent = 'Masuk';
    navBtn.classList.remove('logged-in');
    loggedOutView.style.display = 'block';
    loggedInView.style.display = 'none';
    document.getElementById('adminPanel').style.display = 'none';
  }
}

let lastReportedWordsData = null;

// Container list interaktif buat kata-kata "blocked" (dibikin dinamis lewat JS,
// disisipin persis sebelum <pre id="reportedWordsJson"> biar ga gantung ke markup
// HTML tertentu). Tiap kata ada tombol "Batal Block" yang manggil /unblock-word.
function getOrCreateReportedBlockedListEl() {
  let el = document.getElementById('reportedBlockedList');
  if (!el) {
    const pre = document.getElementById('reportedWordsJson');
    el = document.createElement('div');
    el.id = 'reportedBlockedList';
    pre.parentNode.insertBefore(el, pre);
  }
  return el;
}

function renderReportedBlockedList(blockedWords) {
  const el = getOrCreateReportedBlockedListEl();
  if (!Array.isArray(blockedWords) || blockedWords.length === 0) {
    el.innerHTML = '<div class="reported-empty">Ga ada kata blocked yang dilaporin.</div>';
    return;
  }
  el.innerHTML = blockedWords.map(w => `
    <div class="blocked-item" data-word="${escapeHtml(w)}" data-type="blocked">
      <span>${escapeHtml(w)}</span>
      <button type="button" class="reported-unblock-btn" data-word="${escapeHtml(w)}" data-type="blocked">Batal Block</button>
    </div>
  `).join('');

  el.querySelectorAll('.reported-unblock-btn').forEach(btn => {
    btn.addEventListener('click', () => unblockReportedWord(btn.dataset.word, btn.dataset.type, btn));
  });
}

// Sama kayak kata blocked, kata custom juga bisa dibatalin satu-satu kalau
// ternyata invalid (typo/bukan kata beneran) -- biar ga nyantol selamanya.
function renderReportedCustomList(customWords) {
  const el = document.getElementById('reportedCustomList');
  if (!el) return;
  if (!Array.isArray(customWords) || customWords.length === 0) {
    el.innerHTML = '<div class="reported-empty">Ga ada kata kustom yang dilaporin.</div>';
    return;
  }
  el.innerHTML = customWords.map(w => `
    <div class="blocked-item" data-word="${escapeHtml(w)}" data-type="custom">
      <span>${escapeHtml(w)}</span>
      <button type="button" class="reported-unblock-btn" data-word="${escapeHtml(w)}" data-type="custom">Batalkan</button>
    </div>
  `).join('');

  el.querySelectorAll('.reported-unblock-btn').forEach(btn => {
    btn.addEventListener('click', () => unblockReportedWord(btn.dataset.word, btn.dataset.type, btn));
  });
}

// Dipake buat dua jenis laporan: 'blocked' (kata diblok) dan 'custom' (kata
// custom yang invalid). Backend-nya udah digeneralisir buat nerima param type.
async function unblockReportedWord(word, type, btn) {
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = 'Memproses...';
  try {
    const res = await fetch(AUTH_API_BASE + '/unblock-word', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authToken,
      },
      body: JSON.stringify({ word, type }),
    });
    const result = await res.json();
    if (!res.ok) {
      showToast(result.error || 'gagal batalin');
      btn.disabled = false;
      btn.textContent = originalText;
      return;
    }

    // Copot dari tampilan list + dari cache lastReportedWordsData
    const item = document.querySelector(`.blocked-item[data-word="${CSS.escape(word)}"][data-type="${type}"]`);
    if (item) item.remove();
    if (lastReportedWordsData) {
      const field = type === 'custom' ? 'custom' : 'blocked';
      if (Array.isArray(lastReportedWordsData[field])) {
        lastReportedWordsData[field] = lastReportedWordsData[field].filter(w => w !== word);
      }
    }
    const label = type === 'custom' ? 'dibatalin' : 'batal di-block';
    showToast(`"${word}" ${label} (${result.usersAffected} user kena update)`);
  } catch (e) {
    showToast('gagal fetch: ' + e.message);
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

document.getElementById('reportedWordsBtn').addEventListener('click', async () => {
  const pre = document.getElementById('reportedWordsJson');
  pre.textContent = 'Loading...';
  getOrCreateReportedBlockedListEl().innerHTML = '<div class="reported-empty">Loading...</div>';
  document.getElementById('reportedCustomList').innerHTML = '<div class="reported-empty">Loading...</div>';
  lastReportedWordsData = null;
  document.getElementById('reportedWordsModal').classList.add('show');
  try {
    const res = await fetch(AUTH_API_BASE + '/reported-words', {
      headers: { 'Authorization': 'Bearer ' + authToken },
    });
    const result = await res.json();
    if (!res.ok) {
      pre.textContent = 'Error: ' + (result.error || res.status);
      getOrCreateReportedBlockedListEl().innerHTML = '';
      document.getElementById('reportedCustomList').innerHTML = '';
      return;
    }
    lastReportedWordsData = result;
    renderReportedBlockedList(result.blocked);
    renderReportedCustomList(result.custom);
    // "blocked" & "custom" udah ditampilin interaktif di atas, di sini cuma sisa debug info
    pre.textContent = JSON.stringify(result._debug || {}, null, 2);
  } catch (e) {
    pre.textContent = 'Gagal fetch: ' + e.message;
    getOrCreateReportedBlockedListEl().innerHTML = '';
    document.getElementById('reportedCustomList').innerHTML = '';
  }
});

document.getElementById('downloadReportedWordsBtn').addEventListener('click', () => {
  if (!lastReportedWordsData) {
    showToast('⚠️ belum ada data buat di-download, coba buka ulang panelnya');
    return;
  }
  downloadBlob(JSON.stringify(lastReportedWordsData, null, 2), `reported-words-${todayStr()}.json`, 'application/json');
  showToast('reported words diexport (.json)');
});
document.getElementById('closeReportedWordsModal').addEventListener('click', () => {
  document.getElementById('reportedWordsModal').classList.remove('show');
});

// ---- LUPA PIN (end-user) ----
document.getElementById('forgotPinLink').addEventListener('click', () => {
  document.getElementById('authModal').classList.remove('show');
  document.getElementById('forgotPinErrorMsg').style.display = 'none';
  // Prefill dari username yang udah diketik di form login, biar ga ngetik dobel.
  document.getElementById('forgotPinUsernameInput').value = document.getElementById('authUsernameInput').value.trim();
  document.getElementById('forgotPinCodeInput').value = '';
  document.getElementById('forgotPinNewInput').value = '';
  document.getElementById('forgotPinConfirmInput').value = '';
  document.getElementById('forgotPinModal').classList.add('show');
});
document.getElementById('closeForgotPinModal').addEventListener('click', () => {
  document.getElementById('forgotPinModal').classList.remove('show');
});

function showForgotPinError(msg) {
  const el = document.getElementById('forgotPinErrorMsg');
  el.textContent = msg;
  el.style.display = 'block';
}

document.getElementById('forgotPinSubmitBtn').addEventListener('click', async () => {
  const username = document.getElementById('forgotPinUsernameInput').value.trim().toLowerCase();
  const code = document.getElementById('forgotPinCodeInput').value.trim();
  const newPin = document.getElementById('forgotPinNewInput').value;
  const confirmPin = document.getElementById('forgotPinConfirmInput').value;

  if (!username || !code || !newPin) {
    showForgotPinError('isi semua field dulu bro');
    return;
  }
  if (!isValidPassword(newPin)) {
    showForgotPinError('password minimal 8 karakter, harus ada huruf besar dan angka');
    return;
  }
  if (newPin !== confirmPin) {
    showForgotPinError('konfirmasi password ga cocok');
    return;
  }

  const btn = document.getElementById('forgotPinSubmitBtn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-spinner"></span>';
  try {
    const res = await fetch(AUTH_API_BASE + '/forgot-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, code, newPin }),
    });
    const result = await res.json();
    if (!res.ok) {
      showForgotPinError(result.error || 'gagal, coba lagi');
      btn.disabled = false;
      btn.textContent = originalText;
      return;
    }
    document.getElementById('forgotPinModal').classList.remove('show');
    showToast('password berhasil diganti, login pake password baru lu');
    document.getElementById('authUsernameInput').value = username;
    setAuthTab('login');
    document.getElementById('authModal').classList.add('show');
  } catch (e) {
    showForgotPinError('koneksi gagal, cek internet lu');
  }
  btn.disabled = false;
  btn.textContent = originalText;
});

// ---- RESET PIN USER (admin panel) ----
let pinResetAllUsernames = [];
let pinResetSelectedUsername = null;

function renderPinResetUserList(filter) {
  const listEl = document.getElementById('pinResetUserList');
  const q = (filter || '').trim().toLowerCase();
  const matches = q ? pinResetAllUsernames.filter(u => u.includes(q)) : pinResetAllUsernames;

  if (matches.length === 0) {
    listEl.innerHTML = '<div class="reported-empty">Ga ada username yang cocok.</div>';
    return;
  }
  // Dibatesin biar ga nge-render ribuan node sekaligus kalau user makin banyak
  // -- ngetik lebih spesifik di search box buat mempersempit.
  const shown = matches.slice(0, 50);
  listEl.innerHTML = shown.map(u => `
    <div class="blocked-item" data-username="${escapeHtml(u)}">
      <span>${escapeHtml(u)}</span>
      <button type="button" class="pin-reset-select-btn" data-username="${escapeHtml(u)}">Pilih</button>
    </div>
  `).join('');
  if (matches.length > shown.length) {
    listEl.innerHTML += `<div class="reported-empty">+${matches.length - shown.length} username lagi, persempit pencarian buat liat</div>`;
  }

  listEl.querySelectorAll('.pin-reset-select-btn').forEach(btn => {
    btn.addEventListener('click', () => selectPinResetUsername(btn.dataset.username));
  });
}

function selectPinResetUsername(username) {
  pinResetSelectedUsername = username;
  document.getElementById('pinResetSelectedUsername').textContent = username;
  document.getElementById('pinResetSelectedWrap').style.display = 'block';
  document.getElementById('pinResetCodeWrap').style.display = 'none';
}

document.getElementById('pinResetBtn').addEventListener('click', async () => {
  document.getElementById('pinResetModal').classList.add('show');
  document.getElementById('pinResetSearchInput').value = '';
  document.getElementById('pinResetSelectedWrap').style.display = 'none';
  document.getElementById('pinResetCodeWrap').style.display = 'none';
  pinResetSelectedUsername = null;
  const listEl = document.getElementById('pinResetUserList');
  listEl.innerHTML = '<div class="reported-empty">Loading...</div>';
  try {
    const res = await fetch(AUTH_API_BASE + '/admin/pin-reset/users', {
      headers: { 'Authorization': 'Bearer ' + authToken },
    });
    const result = await res.json();
    if (!res.ok) {
      listEl.innerHTML = `<div class="reported-empty">Error: ${escapeHtml(result.error || res.status)}</div>`;
      return;
    }
    pinResetAllUsernames = result.usernames || [];
    renderPinResetUserList('');
  } catch (e) {
    listEl.innerHTML = `<div class="reported-empty">Gagal fetch: ${escapeHtml(e.message)}</div>`;
  }
});
document.getElementById('closePinResetModal').addEventListener('click', () => {
  document.getElementById('pinResetModal').classList.remove('show');
});
document.getElementById('pinResetSearchInput').addEventListener('input', (e) => {
  renderPinResetUserList(e.target.value);
});

document.getElementById('pinResetGenerateBtn').addEventListener('click', async () => {
  if (!pinResetSelectedUsername) return;
  const btn = document.getElementById('pinResetGenerateBtn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-spinner"></span>';
  try {
    const res = await fetch(AUTH_API_BASE + '/admin/pin-reset/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authToken,
      },
      body: JSON.stringify({ username: pinResetSelectedUsername }),
    });
    const result = await res.json();
    if (!res.ok) {
      showToast(result.error || 'gagal generate kode');
      btn.disabled = false;
      btn.textContent = originalText;
      return;
    }
    document.getElementById('pinResetCodeOutput').value = result.code;
    document.getElementById('pinResetExpiryHint').textContent = `Kadaluarsa dalam ${Math.round(result.expiresInSeconds / 60)} menit.`;
    document.getElementById('pinResetCodeWrap').style.display = 'block';
  } catch (e) {
    showToast('gagal fetch: ' + e.message);
  }
  btn.disabled = false;
  btn.textContent = originalText;
});

document.getElementById('pinResetCopyBtn').addEventListener('click', () => {
  const input = document.getElementById('pinResetCodeOutput');
  input.select();
  navigator.clipboard?.writeText(input.value).then(() => {
    showToast('kode disalin');
  }).catch(() => {
    document.execCommand('copy');
    showToast('kode disalin');
  });
});

// Render dictionaryChanges (added/removed) jadi 2 sub-list chip di dalam dropdown
// "Lihat perubahan kamus". Entry yang gak punya dictionaryChanges gak manggil ini.
function renderDictChanges(dc) {
  const added = Array.isArray(dc.added) ? dc.added : [];
  const removed = Array.isArray(dc.removed) ? dc.removed : [];
  const section = (title, words, cls) => {
    if (words.length === 0) return '';
    return `
      <div class="dict-changes-sub-title">${title} (${words.length})</div>
      <div class="dict-changes-words">
        ${words.map(w => `<span class="dict-word-chip ${cls}">${escapeHtml(w)}</span>`).join('')}
      </div>
    `;
  };
  return `
    <details class="dict-changes-details">
      <summary class="dict-changes-summary">Lihat perubahan kamus <span class="settings-section-chevron">▾</span></summary>
      <div class="dict-changes-body">
        ${section('Ditambah', added, 'added')}
        ${section('Dihapus', removed, 'removed')}
      </div>
    </details>
  `;
}

function renderUpdateLogList() {
  const el = document.getElementById('updateLogList');
  if (!el) return;
  el.innerHTML = UPDATE_LOG.map(entry => `
    <div class="update-log-entry">
      <div class="update-log-version-row">
        <span class="update-log-version">v${entry.version}</span>
        <span class="update-log-date">${entry.date}</span>
      </div>
      <ul class="update-log-changes">
        ${entry.changes.map(c => `<li>${c}</li>`).join('')}
      </ul>
      ${entry.dictionaryChanges ? renderDictChanges(entry.dictionaryChanges) : ''}
    </div>
  `).join('');
}

function openUpdateLogModal() {
  renderUpdateLogList();
  document.getElementById('updateLogModal').classList.add('show');
  localStorage.setItem('samkat_last_seen_updatelog', getMajorMinor(UPDATE_LOG[0].version));
}

document.getElementById('updateLogBtn').addEventListener('click', openUpdateLogModal);
document.getElementById('closeUpdateLogModal').addEventListener('click', () => {
  document.getElementById('updateLogModal').classList.remove('show');
});
document.getElementById('unblockAllBtn').addEventListener('click', async () => {
  const ok = window.confirm('Batal block SEMUA kata yang direported? Semua kata bakal ilang dari daftar blocked, di panel review maupun di list personal tiap user. Ga bisa dibalikin satu-satu, cuma bisa numpuk lagi kalau ada yang ngeblock ulang.');
  if (!ok) return;

  const btn = document.getElementById('unblockAllBtn');
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = 'Memproses...';
  try {
    const res = await fetch(AUTH_API_BASE + '/unblock-all-words', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + authToken },
    });
    const result = await res.json();
    if (!res.ok) {
      showToast(result.error || 'gagal batal block semua');
    } else {
      showToast(`${result.wordsCleared} kata batal di-block (${result.usersAffected} user kena update)`);
      // Kosongin tampilan list + cache kalau modal Reported Words lagi kebuka
      if (lastReportedWordsData) {
        lastReportedWordsData.blocked = [];
        renderReportedBlockedList([]);
      }
    }
  } catch (e) {
    showToast('gagal fetch: ' + e.message);
  }
  btn.disabled = false;
  btn.textContent = originalText;
});

document.getElementById('unblockAllCustomBtn').addEventListener('click', async () => {
  const ok = window.confirm('Batalkan SEMUA kata custom yang direported? Semua kata bakal ilang dari panel review maupun dari daftar kata custom tiap user. Ga bisa dibalikin satu-satu, cuma bisa numpuk lagi kalau ada yang nambahin ulang.');
  if (!ok) return;

  const btn = document.getElementById('unblockAllCustomBtn');
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = 'Memproses...';
  try {
    const res = await fetch(AUTH_API_BASE + '/unblock-all-words?type=custom', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + authToken },
    });
    const result = await res.json();
    if (!res.ok) {
      showToast(result.error || 'gagal batalin semua custom words');
    } else {
      showToast(`${result.wordsCleared} kata custom dibatalin (${result.usersAffected} user kena update)`);
      // Kosongin tampilan list + cache kalau modal Reported Words lagi kebuka
      if (lastReportedWordsData) {
        lastReportedWordsData.custom = [];
        renderReportedCustomList([]);
      }
    }
  } catch (e) {
    showToast('gagal fetch: ' + e.message);
  }
  btn.disabled = false;
  btn.textContent = originalText;
});

document.getElementById('backfillReportedBtn').addEventListener('click', async () => {
  const btn = document.getElementById('backfillReportedBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Menarik data...';
  try {
    const res = await fetch(AUTH_API_BASE + '/backfill-reported-words', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + authToken },
    });
    const result = await res.json();
    if (!res.ok) {
      showToast('⚠️ ' + (result.error || 'gagal narik data'));
    } else {
      showToast(`${result.usersScanned} user discan, ${result.wordsProcessed} entry diproses`);
    }
  } catch (e) {
    showToast('⚠️ gagal fetch: ' + e.message);
  }
  btn.disabled = false;
  btn.textContent = '⬇️ Tarik Data';
});

let authActiveTab = 'login';
function setAuthTab(tab) {
  clearInterval(authRateLimitInterval);
  document.getElementById('authSubmitBtn').disabled = false;
  authActiveTab = tab;
  document.querySelectorAll('.auth-tab').forEach(b => b.classList.toggle('active', b.dataset.authTab === tab));
  document.getElementById('authSubmitBtn').textContent = tab === 'login' ? 'Login' : 'Daftar';
  document.getElementById('authErrorMsg').style.display = 'none';
  document.getElementById('authConfirmPinWrap').style.display = tab === 'register' ? 'block' : 'none';
  document.getElementById('authConfirmPinInput').value = '';
  // Field password ini dipakai bareng buat Login & Daftar (1 input, beda tab) --
  // autocomplete-nya perlu ikut ganti: 'current-password' pas Login (biar browser
  // nawarin password yang UDAH tersimpan), 'new-password' pas Daftar (biar browser
  // nawarin generate/simpen password BARU, bukan isi yang lama).
  document.getElementById('authPinInput').autocomplete = tab === 'login' ? 'current-password' : 'new-password';
  document.getElementById('forgotPinLink').style.display = tab === 'login' ? 'block' : 'none';
}

let authRateLimitInterval = null;

function startAuthCountdown(seconds) {
  clearInterval(authRateLimitInterval);
  const errEl = document.getElementById('authErrorMsg');
  const submitBtn = document.getElementById('authSubmitBtn');
  submitBtn.disabled = true;
  let remaining = Math.max(1, Math.floor(seconds));

  function render() {
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    errEl.textContent = `⏳ kebanyakan percobaan salah, coba lagi dalam ${m}:${String(s).padStart(2, '0')}`;
    errEl.style.display = 'block';
  }
  render();

  authRateLimitInterval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(authRateLimitInterval);
      submitBtn.disabled = false;
      errEl.style.display = 'none';
      return;
    }
    render();
  }, 1000);
}

function showAuthError(msg) {
  const el = document.getElementById('authErrorMsg');
  el.textContent = msg;
  el.style.display = 'block';
}

function isValidPassword(p) {
  return p.length >= 8 && /[A-Z]/.test(p) && /[0-9]/.test(p);
}

async function doAuthSubmit() {
  const username = document.getElementById('authUsernameInput').value.trim().toLowerCase();
  const pin = document.getElementById('authPinInput').value;

  if (!username || !pin) {
    showAuthError('isi username dan password dulu bro');
    return;
  }

  if (authActiveTab === 'register') {
    if (!isValidPassword(pin)) {
      showAuthError('password minimal 8 karakter, harus ada huruf besar dan angka');
      return;
    }
    const confirmPin = document.getElementById('authConfirmPinInput').value;
    if (pin !== confirmPin) {
      showAuthError('konfirmasi password ga cocok');
      return;
    }
  }

  const endpoint = authActiveTab === 'login' ? '/login' : '/register';
  const submitBtn = document.getElementById('authSubmitBtn');
  const originalBtnText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="btn-spinner"></span>';
  try {
    const res = await fetch(AUTH_API_BASE + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, pin }),
    });
    const result = await res.json();
    if (!res.ok) {
      if (res.status === 429 && typeof result.retryAfter === 'number') {
        submitBtn.textContent = originalBtnText; // startAuthCountdown yang atur disabled-nya
        startAuthCountdown(result.retryAfter);
      } else {
        showAuthError(result.error || 'gagal, coba lagi');
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
      }
      return;
    }

    authToken = result.token;
    authUsername = username;
    kompeUnlimitedPresets = !!result.unlimitedKompePresets;
    await storageSet('samkat_auth_token', authToken);
    await storageSet('samkat_auth_username', authUsername);

    const hasKompeServerData = result.data && result.data.kompePresets && ['normal', 'brutal'].some(m =>
      Array.isArray(result.data.kompePresets[m]) && result.data.kompePresets[m].some(p => p.groups && p.groups.length)
    );
    const hasServerData = result.data && (
      (Array.isArray(result.data.pushedWords) && result.data.pushedWords.length) ||
      (Array.isArray(result.data.blocked) && result.data.blocked.length) ||
      (Array.isArray(result.data.kompeGroups) && result.data.kompeGroups.length) ||
      hasKompeServerData ||
      (Array.isArray(result.data.customWords) && result.data.customWords.length)
    );
    if (hasServerData) {
      applyServerData(result.data, 'overwrite');
    } else {
      await syncPushedWordsToServer();
    }

    updateAuthUI();
    document.getElementById('authModal').classList.remove('show');
    document.getElementById('authUsernameInput').value = '';
    document.getElementById('authPinInput').value = '';
    document.getElementById('authConfirmPinInput').value = '';
    showToast(authActiveTab === 'login' ? `✅ login sebagai ${username}` : `✅ akun ${username} dibuat`);
    submitBtn.disabled = false;
    submitBtn.textContent = originalBtnText;
  } catch (e) {
    showAuthError('koneksi gagal, cek internet lu');
    submitBtn.disabled = false;
    submitBtn.textContent = originalBtnText;
  }
}

async function doLogout() {
  const ok = window.confirm('Logout? Progress push tetap kesimpen di akun, tinggal login lagi buat lanjutin.');
  if (!ok) return;

  // Paksa sync sekali lagi (skip debounce & throttle) sebelum beneran logout --
  // biar perubahan yang barusan kejadian (misal push kata detik-detik terakhir)
  // gak keburu ilang gara-gara authToken keburu di-null-in sebelum sync yang
  // dijadwalin (debounce 800ms + throttle 3 detik) sempet jalan.
  const btn = document.getElementById('authLogoutBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Nyimpen data...'; }
  const flushed = await syncPushedWordsToServer();
  if (btn) { btn.disabled = false; btn.textContent = 'Keluar'; }

  if (!flushed) {
    const forceLogout = window.confirm('Gagal nyimpen progress terbaru ke server (kemungkinan koneksi lagi bermasalah). Tetep mau logout? Progress yang belum kesimpen bisa ilang.');
    if (!forceLogout) return;
  }

  authToken = null;
  authUsername = null;
  kompeUnlimitedPresets = false;
  await storageSet('samkat_auth_token', '');
  await storageSet('samkat_auth_username', '');

  // Bersihin data punya akun ini dari device -- biar ga ninggalin residu yang
  // bisa "kesedot" ke akun lain (atau ke sesi guest) pas login berikutnya di
  // device yang sama. Data aslinya aman, tetep kesimpen di server/akun.
  pushedWords = [];
  blocked = [];
  customWords = [];
  kompePresets = { normal: [], brutal: [] };
  kompeActivePresetId = { normal: null, brutal: null };
  ensureDefaultKompePresets();
  rebuildKompeGroupsUnion();
  kompeActiveGroupId = null;
  kompeUsedWords.clear();
  DICTIONARY = Array.from(baseDictSet).sort();
  await storageSet('samkat_pushed_words', JSON.stringify(pushedWords));
  await storageSet('samkat_blocked', JSON.stringify(blocked));
  await storageSet('samkat_custom_words', JSON.stringify(customWords));
  await storageSet('samkat_kompe_presets', JSON.stringify(stripKompePresetsForStorage(kompePresets)));
  await storageSet('samkat_kompe_active_preset', JSON.stringify(kompeActivePresetId));
  rebuildCaches();
  pushUndoStack.length = 0;
  letterStats = null;
  render();
  if (document.getElementById('pushView').classList.contains('active')) renderPushIndex();
  if (document.getElementById('kompeView').classList.contains('active')) renderKompe();

  updateAuthUI();
  document.getElementById('authModal').classList.remove('show');
  showToast('👋 logout berhasil');
}

async function handleAuthFailure(result) {
  if (result && (result.code === 'SESSION_REPLACED' || result.code === 'INVALID_TOKEN')) {
    authToken = null;
    authUsername = null;
    kompeUnlimitedPresets = false;
    await storageSet('samkat_auth_token', '');
    await storageSet('samkat_auth_username', '');
    updateAuthUI();
    showToast(`🔒 ${result.error || 'sesi berakhir, login ulang'}`);
    return true;
  }
  return false;
}

// AFTER
async function checkAndReportWords() {
  if (!authToken) return;
  const total = blocked.length + customWords.length;
  if (total === 0 || total % 25 !== 0) return;
  try {
    await fetch(AUTH_API_BASE + '/report-words', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify({ blocked, customWords }),
    });
  } catch (e) { }
}

async function syncPushedWordsToServer() {
  if (!authToken) return false;
  try {
    syncKompeGroupsToActivePresets();
    const kompePresetsStripped = stripKompePresetsForStorage(kompePresets);
    const res = await fetch(AUTH_API_BASE + '/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authToken,
      },
      body: JSON.stringify({ data: { pushedWords, blocked, kompePresets: kompePresetsStripped, kompeActivePresetId, customWords, accentColor, bgMode, fontFamily } }),
    });
    if (!res.ok) {
      const result = await res.json().catch(() => null);
      await handleAuthFailure(result);
      return false;
    }
    return true;
  } catch (e) { return false; }
}
// Debounce 800ms buat nunda sync abis interaksi terakhir, PLUS hard throttle
// biar sync gak bisa nembak lebih sering dari sekali per 3 detik apapun yang
// terjadi -- ini pengaman kuota KV/D1 kalau ada banyak klik beruntun/bug lain.
const SYNC_MIN_INTERVAL_MS = 3000;
let _lastSyncAt = 0;
let _syncPending = false;

async function throttledSyncPushedWordsToServer() {
  const now = Date.now();
  const elapsed = now - _lastSyncAt;
  if (elapsed < SYNC_MIN_INTERVAL_MS) {
    if (_syncPending) return; // udah ada yang antre, ga usah dobel
    _syncPending = true;
    setTimeout(() => {
      _syncPending = false;
      _lastSyncAt = Date.now();
      syncPushedWordsToServer();
    }, SYNC_MIN_INTERVAL_MS - elapsed);
    return;
  }
  _lastSyncAt = now;
  await syncPushedWordsToServer();
}

const debouncedSync = debounce(throttledSyncPushedWordsToServer, 800);

function applyServerData(data, mode = 'merge') {
  // mode 'merge'     -> dipake pas pull ulang buat AKUN YANG SAMA (reload/pindah device
  //                     sambil masih login). Union aman: data lokal yang belom sempet
  //                     ke-sync (debounce/throttle) ga bakal ketimpa/ilang.
  // mode 'overwrite' -> dipake pas FRESH LOGIN/REGISTER. Data lokal di titik ini
  //                     belum tentu milik akun yang baru login (bisa data guest,
  //                     atau residu akun lain) -- jadi harus ditimpa total sama data
  //                     server, bukan digabung.
  if (Array.isArray(data.pushedWords)) {
    if (mode === 'overwrite') {
      pushedWords = Array.from(new Set(data.pushedWords));
      storageSet('samkat_pushed_words', JSON.stringify(pushedWords));
    } else {
      const mergedPushedWords = Array.from(new Set([...pushedWords, ...data.pushedWords]));
      const gotNewFromMerge = mergedPushedWords.length !== data.pushedWords.length;
      pushedWords = mergedPushedWords;
      storageSet('samkat_pushed_words', JSON.stringify(pushedWords));
      // kalau lokal ternyata punya kata yang server belom punya, langsung sync balik
      // biar server ga ketinggalan lagi (ga usah nunggu next push manual)
      if (gotNewFromMerge) debouncedSync();
    }
  }
  if (Array.isArray(data.customWords)) {
    customWords = Array.from(new Set(data.customWords)).filter(w => !baseDictSet.has(w));
    storageSet('samkat_custom_words', JSON.stringify(customWords));
    DICTIONARY = Array.from(new Set([...baseDictSet, ...customWords])).sort();
    rebuildCaches();
  }
  if (Array.isArray(data.blocked)) {
    blocked = data.blocked.filter(w => dictSet.has(w));
    storageSet('samkat_blocked', JSON.stringify(blocked));
  }
  rebuildCaches();
  pruneStalePushedWords(true);
  if (data.kompePresets && typeof data.kompePresets === 'object') {
    // format baru (per preset per mode)
    kompePresets = hydrateKompePresets(data.kompePresets);
    if (data.kompeActivePresetId && typeof data.kompeActivePresetId === 'object') {
      kompeActivePresetId = { normal: data.kompeActivePresetId.normal, brutal: data.kompeActivePresetId.brutal };
    }
    ensureDefaultKompePresets();
    rebuildKompeGroupsUnion();
    storageSet('samkat_kompe_presets', JSON.stringify(data.kompePresets));
    storageSet('samkat_kompe_active_preset', JSON.stringify(kompeActivePresetId));
  } else if (Array.isArray(data.kompeGroups)) {
    // format lama (flat, dari device/backup yang belum kena update) -- migrasi ke preset
    const flatGroups = data.kompeGroups.map(g => {
      const group = computeKompeGroup(g.segment, g.weight, g.mode);
      if (group) group.id = g.id;
      return group;
    }).filter(Boolean);
    kompePresets = migrateFlatKompeGroupsToPresets(flatGroups);
    kompeActivePresetId = { normal: kompePresets.normal[0].id, brutal: kompePresets.brutal[0].id };
    rebuildKompeGroupsUnion();
    saveKompeGroups(); // persist hasil migrasi & sync balik ke server pake format baru
  }
  if (typeof data.accentColor === 'string' || typeof data.bgMode === 'string' || typeof data.fontFamily === 'string') {
    if (typeof data.accentColor === 'string') accentColor = data.accentColor;
    if (typeof data.bgMode === 'string') bgMode = data.bgMode;
    if (typeof data.fontFamily === 'string') fontFamily = resolveFontFamily(data.fontFamily).id;
    applyAppearance();
    storageSet('samkat_accent', accentColor);
    storageSet('samkat_bgmode', bgMode);
    storageSet('samkat_font', fontFamily);
  }
  letterStats = null;
  render();
  if (document.getElementById('pushView').classList.contains('active')) renderPushIndex();
  if (document.getElementById('kompeView').classList.contains('active')) renderKompe();
}

// AFTER
async function pullFromServer() {
  if (!authToken) return;
  try {
    const res = await fetch(AUTH_API_BASE + '/sync', {
      headers: { 'Authorization': 'Bearer ' + authToken },
    });
    const result = await res.json().catch(() => null);
    if (!res.ok) {
      await handleAuthFailure(result);
      return;
    }
    if (result) kompeUnlimitedPresets = !!result.unlimitedKompePresets;
    if (result && result.data) applyServerData(result.data);
  } catch (e) {}
}

// ---- BACKUP ----
const MONTH_NAMES_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function formatBackupTimestamp(unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  const day = d.getDate();
  const month = MONTH_NAMES_ID[d.getMonth()];
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hh}:${mm}`;
}

function renderBackupList(backups) {
  const el = document.getElementById('backupListEl');
  if (!Array.isArray(backups) || backups.length === 0) {
    el.innerHTML = '<div class="reported-empty">Belum ada backup yang kesimpen.</div>';
    return;
  }
  // Terbaru di atas -- backend udah ngurutin created_at DESC, tapi dipastiin lagi di sini.
  const sorted = [...backups].sort((a, b) => b.created_at - a.created_at);
  el.innerHTML = sorted.map(b => `
    <div class="backup-item" data-id="${b.id}">
      <div class="backup-item-info">
        <div class="backup-item-time">${formatBackupTimestamp(b.created_at)}</div>
        <div class="backup-item-detail">${b.pushedWordsCount} kata terpush &middot; ${b.kompeGroupsCount} grup trap</div>
      </div>
      <button type="button" class="backup-restore-btn" data-id="${b.id}">Restore</button>
    </div>
  `).join('');

  el.querySelectorAll('.backup-restore-btn').forEach(btn => {
    btn.addEventListener('click', () => restoreBackup(Number(btn.dataset.id), btn));
  });
}

async function openBackupHistory() {
  document.getElementById('backupModal').classList.add('show');
  const el = document.getElementById('backupListEl');
  el.innerHTML = '<div class="reported-empty">Loading...</div>';
  try {
    const res = await fetch(AUTH_API_BASE + '/backups', {
      headers: { 'Authorization': 'Bearer ' + authToken },
    });
    const result = await res.json().catch(() => null);
    if (!res.ok) {
      const handled = await handleAuthFailure(result);
      if (!handled) showToast((result && result.error) || 'gagal ambil riwayat backup');
      el.innerHTML = '<div class="reported-empty">Gagal ambil riwayat backup.</div>';
      return;
    }
    renderBackupList(result.backups);
  } catch (e) {
    el.innerHTML = '<div class="reported-empty">Gagal ambil riwayat backup.</div>';
    showToast('gagal fetch: ' + e.message);
  }
}

async function restoreBackup(backupId, btn) {
  const ok = window.confirm('Restore ke titik backup ini? Data yang sekarang bakal ketimpa (tapi tetep kesimpen dulu sebagai backup baru sebelum ditimpa, jadi masih bisa dibalikin lagi kalau salah pilih).');
  if (!ok) return;

  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = 'Memproses...';
  try {
    const res = await fetch(AUTH_API_BASE + '/restore', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authToken,
      },
      body: JSON.stringify({ backupId }),
    });
    const result = await res.json().catch(() => null);
    if (!res.ok) {
      const handled = await handleAuthFailure(result);
      if (!handled) showToast((result && result.error) || 'gagal restore');
      btn.disabled = false;
      btn.textContent = originalText;
      return;
    }

    applyServerData(result.data, 'overwrite');
    showToast('data berhasil di-restore');
    document.getElementById('backupModal').classList.remove('show');
  } catch (e) {
    showToast('gagal fetch: ' + e.message);
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

document.getElementById('backupHistoryBtn').addEventListener('click', openBackupHistory);
document.getElementById('closeBackupModal').addEventListener('click', () => {
  document.getElementById('backupModal').classList.remove('show');
});

document.getElementById('authOpenBtn').addEventListener('click', () => {
  document.getElementById('authModal').classList.add('show');
});
document.getElementById('closeAuthModal').addEventListener('click', () => {
  document.getElementById('authModal').classList.remove('show');
});
document.querySelectorAll('.auth-tab').forEach(btn => {
  btn.addEventListener('click', () => setAuthTab(btn.dataset.authTab));
});
document.querySelectorAll('.pw-toggle-icon').forEach(icon => {
  icon.addEventListener('click', () => {
    const input = document.getElementById(icon.dataset.toggleFor);
    if (input.type === 'password') {
      input.type = 'text';
      icon.textContent = 'Hide';
    } else {
      input.type = 'password';
      icon.textContent = 'Show';
    }
  });
});
document.getElementById('authForm').addEventListener('submit', (e) => {
  e.preventDefault();
  doAuthSubmit();
});

// Enter di username -> pindah ke password. Enter di password -> pindah ke
// "ulangi password" (kalau lagi mode daftar & keliatan), atau langsung submit
// kalau itu input terakhir yang keliatan (mode login, atau mode daftar di
// field ulangi password).
document.getElementById('authUsernameInput').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  document.getElementById('authPinInput').focus();
});
document.getElementById('authPinInput').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const confirmWrap = document.getElementById('authConfirmPinWrap');
  const confirmVisible = confirmWrap && confirmWrap.style.display !== 'none';
  if (confirmVisible) {
    document.getElementById('authConfirmPinInput').focus();
  } else {
    doAuthSubmit();
  }
});
document.getElementById('authConfirmPinInput').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  doAuthSubmit();
});
document.getElementById('authLogoutBtn').addEventListener('click', doLogout);

async function init() {
  // Auto-reload SEKALI kalau ada versi baru (dictionary/script) dibanding
  // terakhir kali tab ini dibuka. Pakai localStorage (bukan sessionStorage)
  // biar persist antar sesi, dan cuma reload kalau BENERAN ada versi baru --
  // bukan tiap kali dibuka (itu bikin page keload 2x setiap kunjungan).
  const lastSeenVersion = localStorage.getItem('samkat_last_seen_version');
  if (lastSeenVersion !== DICTIONARY_VERSION) {
    localStorage.setItem('samkat_last_seen_version', DICTIONARY_VERSION);
    if (lastSeenVersion !== null) {
      // cuma reload kalau ini BUKAN kunjungan pertama (ada versi lama yang beda),
      // biar first-time visitor ga kena reload sia-sia
      location.reload();
      return;
    }
  }

  renderInputRow();
  setupClearButtons();
  await loadDefaultDictionary();
  await loadStorage();
  await loadAppearance();
  await loadGuidePref();
  await loadSearchPushPref();
  await loadPushedWords();
  await loadKompeGroups();
  await loadAuthSession();

  // Auto-buka modal Update Log kalau major.minor rilis terbaru beda dari yang
  // terakhir diliat user. Update kamus doang (patch version) sengaja gak
  // ngetrigger ini -- liat komentar di deklarasi UPDATE_LOG.
  const currentVersionTag = document.getElementById('currentVersionTag');
  if (currentVersionTag) currentVersionTag.textContent = 'v' + DICTIONARY_VERSION;

  const lastSeenUpdateLog = localStorage.getItem('samkat_last_seen_updatelog');
  const latestMajorMinor = getMajorMinor(UPDATE_LOG[0].version);
  if (lastSeenUpdateLog !== latestMajorMinor) {
    openUpdateLogModal();
  }
}
init();