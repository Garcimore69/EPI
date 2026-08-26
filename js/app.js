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

function toutesLesEntrees(){
  return INGREDIENTS.concat(carnetPerso);
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

function badgeInfo(niveau){
  if(niveau === "danger") return { label:"Contient du gluten", cls:"danger" };
  if(niveau === "warn") return { label:"À vérifier (sur l'étiquette du produit)", cls:"warn" };
  if(niveau === "safe") return { label:"Sans gluten", cls:"safe" };
  return { label:"Non répertorié", cls:"unknown" };
}

function analyser(){
  const q = document.getElementById("query").value;
  if(!q.trim()) return;

  const morceaux = q.split(",").map(s => s.trim()).filter(Boolean);
  const trouves = morceaux.map(m => ({ texte:m, match: chercheIngredient(m) }));

  const ordre = { safe:0, unknown:1, warn:2, danger:3 };
  let pire = "safe";
  trouves.forEach(t => {
    const n = t.match ? t.match.niveau : "unknown";
    if(ordre[n] > ordre[pire]) pire = n;
  });

  dernierResultat = { titre:q, niveau:pire };

  const b = badgeInfo(pire);

  const rows = trouves.map(t => {
    if(t.match){
      const tb = badgeInfo(t.match.niveau);
      return `<div class="ingredient-row">
        <div class="head"><span class="name">${escapeHtml(t.texte)}</span><span class="tag ${tb.cls}">${tb.label}</span></div>
        <span class="note">${escapeHtml(t.match.note)}</span>
      </div>`;
    }
    return `<div class="ingredient-row">
      <div class="head"><span class="name">${escapeHtml(t.texte)}</span><span class="tag unknown">Non répertorié</span></div>
      <span class="note">Pas encore dans le carnet — vérifie l'étiquette, ou ajoute-le si tu as une source fiable.</span>
    </div>`;
  }).join("");

  const sources = [...new Set(trouves.filter(t => t.match).map(t => t.match.source))];
  const sourcesHtml = sources.length
    ? `<div class="sources"><div class="label">Sources</div><ul>${sources.map(s => `<li>${escapeHtml(s)}</li>`).join("")}</ul></div>`
    : `<div class="sources"><div class="label">Sources</div><ul><li>Aucun ingrédient reconnu dans le carnet.</li></ul></div>`;

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
