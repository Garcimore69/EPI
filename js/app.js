const STORAGE_KEY = "epi-carnet-perso-v1";

function normaliser(txt){
  return txt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function chargerCarnetPerso(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  }catch(e){
    return [];
  }
}

function sauverCarnetPerso(liste){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(liste)); }catch(e){}
}

let carnetPerso = chargerCarnetPerso();
let dernierResultat = null;
let derniereAnalyse = { morceaux:[], trouves:[] };

function toutesLesEntrees(){
  return INGREDIENTS.concat(carnetPerso);
}

const MOTS_VIDES = [
  "de","du","des","le","la","les","un","une","et","au","aux","avec","sans","a","l","d","en",
  "bio","frais","fraiche","fraîche","nature","entier","entiere","entière","maison","cru","crue","cuit","cuite"
];

function motsSignificatifs(texte){
  return normaliser(texte).split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !MOTS_VIDES.includes(w));
}

// Cherche l'entrée qui correspond le mieux à un morceau de texte donné.
// On privilégie la correspondance la plus longue et la plus précise (pour éviter
// que "farine" générique masque "farine de blé" par exemple).
function chercheIngredient(morceau){
  const cible = normaliser(morceau);
  let meilleur = null;
  let meilleureLongueur = 0;

  toutesLesEntrees().forEach(entree => {
    entree.noms.forEach(nom => {
      const n = normaliser(nom);
      const correspond = cible === n || cible.includes(n) || n.includes(cible);
      if(correspond && n.length > meilleureLongueur){
        meilleur = entree;
        meilleureLongueur = n.length;
      }
    });
  });
  return meilleur;
}

// --- Correcteur orthographique léger (distance de Levenshtein) ---

function distanceLevenshtein(a, b){
  const m = a.length, n = b.length;
  const dp = Array.from({ length:m + 1 }, () => new Array(n + 1).fill(0));
  for(let i = 0; i <= m; i++) dp[i][0] = i;
  for(let j = 0; j <= n; j++) dp[0][j] = j;
  for(let i = 1; i <= m; i++){
    for(let j = 1; j <= n; j++){
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j-1], dp[i-1][j], dp[i][j-1]);
    }
  }
  return dp[m][n];
}

// Construit un index normalisé -> orthographe originale à partir de tous les mots
// connus de la base (officielle + carnet perso), pour proposer des corrections.
function construireIndexMots(){
  const index = new Map();
  toutesLesEntrees().forEach(e => {
    e.noms.forEach(nom => {
      nom.split(/[^a-zA-ZÀ-ÿ0-9]+/).forEach(w => {
        if(w.length < 3) return;
        const norm = normaliser(w);
        if(!index.has(norm)) index.set(norm, w);
      });
    });
  });
  return index;
}

function suggererCorrection(motNormalise, index){
  if(motNormalise.length < 4) return null;
  let meilleur = null, meilleureDist = Infinity;
  index.forEach((original, norm) => {
    if(norm === motNormalise) return;
    if(Math.abs(norm.length - motNormalise.length) > 2) return;
    const d = distanceLevenshtein(motNormalise, norm);
    if(d < meilleureDist){ meilleureDist = d; meilleur = original; }
  });
  const seuil = motNormalise.length <= 5 ? 1 : 2;
  return (meilleur && meilleureDist <= seuil) ? meilleur : null;
}

// Reconstruit le texte d'origine en remplaçant uniquement les mots corrigés,
// en conservant ponctuation et espaces intacts.
function construireTexteCorrige(texte, corrections){
  if(!corrections.size) return null;
  let changed = false;
  const nouveau = texte.split(/([^a-zA-ZÀ-ÿ0-9]+)/).map(tok => {
    if(!tok) return tok;
    const norm = normaliser(tok);
    if(corrections.has(norm)){ changed = true; return corrections.get(norm); }
    return tok;
  }).join("");
  return changed ? nouveau : null;
}

function badgeInfo(niveau){
  if(niveau === "danger") return { label:"Contient du gluten", cls:"danger" };
  if(niveau === "warn") return { label:"À vérifier (sur l'étiquette du produit)", cls:"warn" };
  if(niveau === "safe") return { label:"Sans gluten", cls:"safe" };
  return { label:"Non répertorié", cls:"unknown" };
}

// Évalue un morceau de texte : trouve le meilleur ingrédient correspondant, vérifie
// que tous les mots significatifs de la recherche sont couverts par cette correspondance,
// et propose une correction orthographique pour les mots non reconnus.
// Si un mot inconnu (faute de frappe, terme non reconnu) traîne à côté d'un mot connu
// classé "sans gluten", on refuse de conclure à un résultat rassurant : mieux vaut
// afficher "non répertorié" que risquer un faux "sans gluten".
function evaluerMorceau(morceau){
  const match = chercheIngredient(morceau);
  const motsQuery = motsSignificatifs(morceau);
  let motsNonCouverts, niveauEffectif;

  if(!match){
    niveauEffectif = "unknown";
    motsNonCouverts = motsQuery;
  } else {
    const aliasNormalises = match.noms.map(n => normaliser(n));
    motsNonCouverts = motsQuery.filter(w => !aliasNormalises.some(a => a.includes(w)));
    const couvertureOk = motsNonCouverts.length === 0;
    niveauEffectif = (match.niveau === "safe" && !couvertureOk) ? "unknown" : match.niveau;
  }

  let texteCorrige = null;
  if(motsNonCouverts.length){
    const index = construireIndexMots();
    const corrections = new Map();
    motsNonCouverts.forEach(w => {
      const s = suggererCorrection(w, index);
      if(s) corrections.set(w, s);
    });
    texteCorrige = construireTexteCorrige(morceau, corrections);
  }

  return { match, niveauEffectif, motsNonCouverts, texteCorrige };
}

function analyser(){
  const q = document.getElementById("query").value;
  if(!q.trim()) return;

  const morceaux = q.split(",").map(s => s.trim()).filter(Boolean);
  const trouves = morceaux.map(m => ({ texte:m, ...evaluerMorceau(m) }));

  derniereAnalyse = { morceaux, trouves };

  const ordre = { safe:0, unknown:1, warn:2, danger:3 };
  let pire = "safe";
  trouves.forEach(t => {
    if(ordre[t.niveauEffectif] > ordre[pire]) pire = t.niveauEffectif;
  });

  dernierResultat = { titre:q, niveau:pire };

  const b = badgeInfo(pire);

  const rows = trouves.map((t, i) => {
    const suggestion = t.texteCorrige
      ? `<button class="suggestion-btn" onclick="appliquerCorrection(${i})">Vouliez-vous dire « ${escapeHtml(t.texteCorrige)} » ?</button>`
      : "";
    if(t.match){
      const tb = badgeInfo(t.niveauEffectif);
      const degrade = t.niveauEffectif !== t.match.niveau;
      const note = degrade
        ? `« ${t.motsNonCouverts.join(', ')} » n'est pas reconnu (faute de frappe ?). Seul « ${t.match.noms[0]} » est identifié comme sans gluten — vérifie l'orthographe avant de conclure.`
        : t.match.note;
      return `<div class="ingredient-row">
        <div class="head"><span class="name">${escapeHtml(t.texte)}</span><span class="tag ${tb.cls}">${tb.label}</span></div>
        <span class="note">${escapeHtml(note)}</span>
        ${suggestion}
      </div>`;
    }
    return `<div class="ingredient-row">
      <div class="head"><span class="name">${escapeHtml(t.texte)}</span><span class="tag unknown">Non répertorié</span></div>
      <span class="note">Pas encore dans le carnet — vérifie l'étiquette, ou ajoute-le si tu as une source fiable.</span>
      ${suggestion}
    </div>`;
  }).join("");

  const sources = [...new Set(trouves.filter(t => t.match && t.niveauEffectif === t.match.niveau).map(t => t.match.source))];
  const sourcesHtml = sources.length
    ? `<div class="sources"><div class="label">Sources</div><ul>${sources.map(s => `<li>${escapeHtml(s)}</li>`).join("")}</ul></div>`
    : `<div class="sources"><div class="label">Sources</div><ul><li>Aucun ingrédient reconnu avec certitude dans le carnet.</li></ul></div>`;

  const dejaDansCarnet = toutesLesEntrees().some(e => normaliser(e.noms[0]) === normaliser(q));

  document.getElementById("result").innerHTML = `
    <div class="card">
      <div class="result-head">
        <div>
          <h3>${escapeHtml(q)}</h3>
          <span class="badge ${b.cls}">${b.label}</span>
        </div>
      </div>
      <div class="result-body">
        <p>Analyse ingrédient par ingrédient à partir du carnet :</p>
        <div class="ingredient-list">${rows}</div>
        ${sourcesHtml}
      </div>
      <div class="actions-row">
        <button class="btn-secondary" onclick="ouvrirCarnet()">Voir le carnet</button>
        <button class="btn-add ${dejaDansCarnet ? "added" : ""}" id="addBtn" onclick="ajouterAuCarnet()" ${dejaDansCarnet ? "disabled" : ""}>
          ${dejaDansCarnet ? "✓ Déjà dans le carnet" : "＋ Ajouter au carnet"}
        </button>
      </div>
    </div>`;
}

function appliquerCorrection(index){
  const t = derniereAnalyse.trouves[index];
  if(!t || !t.texteCorrige) return;
  const nouveauxMorceaux = [...derniereAnalyse.morceaux];
  nouveauxMorceaux[index] = t.texteCorrige;
  document.getElementById("query").value = nouveauxMorceaux.join(", ");
  analyser();
}

function ajouterAuCarnet(){
  if(!dernierResultat) return;
  const nom = dernierResultat.titre.trim();
  const existe = toutesLesEntrees().some(e => normaliser(e.noms[0]) === normaliser(nom));
  if(!existe){
    carnetPerso.push({
      id: "perso-" + Date.now(),
      noms: [nom],
      categorie: "Ajoutés par vous",
      niveau: dernierResultat.niveau,
      note: "Ajouté manuellement depuis un résultat d'analyse.",
      source: "Ajout personnel"
    });
    sauverCarnetPerso(carnetPerso);
  }
  const btn = document.getElementById("addBtn");
  if(btn){
    btn.textContent = "✓ Ajouté au carnet";
    btn.classList.add("added");
    btn.disabled = true;
  }
  if(document.getElementById("carnet").classList.contains("open")) renderCarnet();
}

function ouvrirCarnet(){
  document.getElementById("carnet").classList.add("open");
  renderCarnet();
  document.getElementById("carnet").scrollIntoView({ behavior:"smooth", block:"start" });
}

function toggleCarnet(){
  const el = document.getElementById("carnet");
  el.classList.toggle("open");
  if(el.classList.contains("open")) renderCarnet();
}

function supprimerDuCarnetPerso(id){
  carnetPerso = carnetPerso.filter(e => e.id !== id);
  sauverCarnetPerso(carnetPerso);
  renderCarnet(document.getElementById("carnet-search").value);
}

function renderCarnet(filtre = ""){
  const f = normaliser(filtre);
  const groupes = {};
  toutesLesEntrees()
    .filter(e => !f || e.noms.some(n => normaliser(n).includes(f)))
    .forEach(e => {
      groupes[e.categorie] = groupes[e.categorie] || [];
      groupes[e.categorie].push(e);
    });

  let html = "";
  Object.keys(groupes).sort().forEach(g => {
    html += `<div class="carnet-group"><h4>${escapeHtml(g)}</h4>`;
    groupes[g].forEach(e => {
      const b = badgeInfo(e.niveau);
      const estPerso = e.categorie === "Ajoutés par vous";
      html += `<div class="carnet-item ${estPerso ? "custom" : ""}">
        <div class="head">
          <span class="name">${escapeHtml(e.noms[0])}</span>
          <span class="badge ${b.cls}">${b.label}</span>
        </div>
        <div class="badge-row">
          <span class="src">${escapeHtml(e.source)}</span>
          ${estPerso ? `<button class="del-btn" title="Retirer" onclick="supprimerDuCarnetPerso('${e.id}')">&times;</button>` : ""}
        </div>
      </div>`;
    });
    html += `</div>`;
  });

  document.getElementById("carnet-content").innerHTML = html || "<p class='empty'>Aucun résultat pour ce filtre.</p>";
}

function escapeHtml(str){
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

document.getElementById("query").addEventListener("focus", function(){
  if(!this.dataset.cleared){
    this.value = "";
    this.dataset.cleared = "1";
  }
});

document.getElementById("query").addEventListener("keydown", function(e){
  if(e.key === "Enter") analyser();
});

document.getElementById("carnet-search").addEventListener("input", function(){
  renderCarnet(this.value);
});
