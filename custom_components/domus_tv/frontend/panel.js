// Domus TV editor panel: design Freebox Player dashboards from Home Assistant.
import { SCREEN, cellSize, visibleRows, rowMetrics, tileRect, defaultType, defaultSize, effectiveType, pack } from "./layout.js";

const TYPES = [
  ["auto", "Automatique"], ["toggle", "Interrupteur"], ["light", "Lumière"], ["button", "Bouton / scène"],
  ["sensor", "Valeur"], ["cover", "Volet / portail"], ["climate", "Thermostat"], ["camera", "Caméra"],
  ["lock", "Serrure"], ["media", "Lecteur multimédia"], ["header", "Titre de section"],
];
const COLORS = ["", "#f5a623", "#4cafef", "#46c37b", "#e5534b", "#a371f7", "#ef6fb6", "#2ec4b6", "#8a8f98"];
const SKIP_DOMAINS = new Set(["update", "device_tracker", "person", "zone", "sun", "event", "tts", "stt",
  "conversation", "image", "notify", "assist_satellite", "wake_word", "todo", "calendar"]);

const uid = () => Math.random().toString(36).slice(2, 10);
const clone = (o) => JSON.parse(JSON.stringify(o));

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") {
      for (const [p, val] of Object.entries(v)) {
        if (p.startsWith("--")) el.style.setProperty(p, val); else el.style[p] = val;
      }
    }
    else if (k.startsWith(".")) el[k.slice(1)] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

class DomusTvPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._dashboards = null;
    this._saved = "";
    this._dash = 0;
    this._sel = null;
    this._view = "editor";
    this._tvs = [];
    this._msg = "";
    this._dragId = null;
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._load();
    else if (this._dashboards && this._view === "editor") this._refreshStates();
  }
  set narrow(v) { this._narrow = v; }
  set panel(v) { this._panel = v; }

  connectedCallback() {
    this._onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); this._save(); }
    };
    this._onUnload = (e) => { if (this._dirty()) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("keydown", this._onKey);
    window.addEventListener("beforeunload", this._onUnload);
  }
  disconnectedCallback() {
    window.removeEventListener("keydown", this._onKey);
    window.removeEventListener("beforeunload", this._onUnload);
  }

  async _load() {
    try {
      const res = await this._hass.callWS({ type: "domus_tv/config/get" });
      this._dashboards = res.dashboards;
      this._saved = JSON.stringify(res.dashboards);
      this._tvs = await this._hass.callWS({ type: "domus_tv/tv/list" });
    } catch (err) {
      this._msg = "Chargement impossible : " + (err.message || err.code);
      this._dashboards = [];
    }
    this._render();
  }

  _dirty() { return this._dashboards && JSON.stringify(this._dashboards) !== this._saved; }
  get _cur() { return this._dashboards[this._dash]; }

  async _save() {
    if (!this._dirty()) return;
    try {
      const res = await this._hass.callWS({ type: "domus_tv/config/save", dashboards: this._dashboards });
      this._dashboards = res.dashboards;
      this._saved = JSON.stringify(res.dashboards);
      this._toast(`Enregistré (v${res.version}). Les Players se mettent à jour d'eux-mêmes.`);
    } catch (err) {
      this._toast("Erreur : " + (err.message || err.code), true);
    }
    this._render();
  }

  _toast(text, error = false) {
    this._msg = text; this._msgErr = error;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { this._msg = ""; this._render(); }, 5000);
  }

  _change(fn) {
    fn();
    pack(this._cur.tiles, this._cur.columns);
    this._render();
  }

  // ------------------------------------------------------------------ helpers
  _stateText(entityId) {
    const st = this._hass.states[entityId];
    if (!st) return "introuvable";
    try { if (this._hass.formatEntityState) return this._hass.formatEntityState(st); } catch (e) { /* older HA */ }
    const unit = st.attributes.unit_of_measurement;
    return unit ? `${st.state} ${unit}` : st.state;
  }
  _name(tile) {
    if (tile.name) return tile.name;
    const st = this._hass.states[tile.entity];
    return (st && st.attributes.friendly_name) || tile.entity || "Titre";
  }
  _icon(tile) {
    if (tile.icon) return h("ha-icon", { icon: tile.icon });
    const st = this._hass.states[tile.entity];
    if (st && customElements.get("ha-state-icon")) {
      return h("ha-state-icon", { ".hass": this._hass, ".stateObj": st });
    }
    return h("ha-icon", { icon: "mdi:shape" });
  }
  _isOn(entityId) {
    const st = this._hass.states[entityId];
    return st && ["on", "open", "opening", "unlocked", "playing", "heat", "cool", "auto", "heat_cool"].includes(st.state);
  }
  _entityOptions() {
    if (this._entityList) return this._entityList;
    this._entityList = Object.values(this._hass.states)
      .filter((s) => !SKIP_DOMAINS.has(s.entity_id.split(".")[0]))
      .map((s) => ({ id: s.entity_id, name: s.attributes.friendly_name || s.entity_id }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return this._entityList;
  }

  // ------------------------------------------------------------------ actions
  _addTile(entity = "", type = "auto") {
    const cols = this._cur.columns;
    const t = { id: uid(), type, entity, name: "", icon: "", color: "", ...defaultSize(type === "auto" ? defaultType(entity) : type, cols) };
    this._change(() => this._cur.tiles.push(t));
    this._sel = t.id;
    this._render();
    if (!entity && type !== "header") this.shadowRoot.querySelector("#f-entity")?.focus();
  }

  _addArea(areaId) {
    const ents = Object.values(this._hass.entities || {});
    const devices = this._hass.devices || {};
    const wanted = ents.filter((e) => {
      if (e.hidden || e.entity_category) return false;
      const area = e.area_id || (e.device_id && devices[e.device_id] && devices[e.device_id].area_id);
      return area === areaId && this._hass.states[e.entity_id] && !SKIP_DOMAINS.has(e.entity_id.split(".")[0]);
    });
    const present = new Set(this._cur.tiles.map((t) => t.entity));
    const areaName = (this._hass.areas[areaId] || {}).name || "Pièce";
    this._change(() => {
      this._cur.tiles.push({ id: uid(), type: "header", entity: "", name: areaName, icon: "", color: "", w: this._cur.columns, h: 1 });
      for (const e of wanted) {
        if (present.has(e.entity_id)) continue;
        const type = defaultType(e.entity_id);
        this._cur.tiles.push({ id: uid(), type: "auto", entity: e.entity_id, name: "", icon: "", color: "", ...defaultSize(type, this._cur.columns) });
      }
    });
    this._toast(`${wanted.length} entité(s) ajoutée(s) depuis « ${areaName} ».`);
    this._render();
  }

  _move(id, delta) {
    const tiles = this._cur.tiles;
    const i = tiles.findIndex((t) => t.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= tiles.length) return;
    this._change(() => { const [t] = tiles.splice(i, 1); tiles.splice(j, 0, t); });
  }

  _drop(targetId) {
    const tiles = this._cur.tiles;
    const from = tiles.findIndex((t) => t.id === this._dragId);
    const to = tiles.findIndex((t) => t.id === targetId);
    if (from < 0 || to < 0 || from === to) return;
    this._change(() => { const [t] = tiles.splice(from, 1); tiles.splice(to, 0, t); });
  }

  _removeTile(id) {
    this._change(() => { this._cur.tiles = this._cur.tiles.filter((t) => t.id !== id); });
    this._sel = null;
    this._render();
  }

  _addDashboard() {
    this._dashboards.push({ id: uid(), title: "Nouveau", icon: "", columns: 6, tiles: [] });
    this._dash = this._dashboards.length - 1;
    this._sel = null;
    this._render();
  }

  _removeDashboard() {
    if (this._dashboards.length < 2) return this._toast("Il faut garder au moins un dashboard.", true);
    if (!confirm(`Supprimer le dashboard « ${this._cur.title} » ?`)) return;
    this._dashboards.splice(this._dash, 1);
    this._dash = 0; this._sel = null;
    this._render();
  }

  _moveDashboard(delta) {
    const j = this._dash + delta;
    if (j < 0 || j >= this._dashboards.length) return;
    const [d] = this._dashboards.splice(this._dash, 1);
    this._dashboards.splice(j, 0, d);
    this._dash = j;
    this._render();
  }

  async _pair(code, name) {
    try {
      const tv = await this._hass.callWS({ type: "domus_tv/pair", code, name: name || undefined });
      this._toast(`« ${tv.name} » est associé. Le Player affiche votre dashboard dans quelques secondes.`);
      this._tvs = await this._hass.callWS({ type: "domus_tv/tv/list" });
    } catch (err) {
      this._toast("Code inconnu ou expiré. Vérifiez le code affiché sur la TV.", true);
    }
    this._render();
  }

  async _revoke(tv) {
    if (!confirm(`Retirer l'accès de « ${tv.name} » ? Il faudra l'associer à nouveau.`)) return;
    await this._hass.callWS({ type: "domus_tv/tv/revoke", tv_id: tv.id });
    this._tvs = await this._hass.callWS({ type: "domus_tv/tv/list" });
    this._render();
  }

  async _rename(tv) {
    const name = prompt("Nom du Player", tv.name);
    if (!name) return;
    await this._hass.callWS({ type: "domus_tv/tv/rename", tv_id: tv.id, name });
    this._tvs = await this._hass.callWS({ type: "domus_tv/tv/list" });
    this._render();
  }

  // ------------------------------------------------------------------ render
  _refreshStates() {
    // Live state text in the preview without rebuilding the editor (keeps focus).
    const root = this.shadowRoot;
    for (const el of root.querySelectorAll("[data-state-for]")) {
      el.textContent = this._stateText(el.dataset.stateFor);
    }
    for (const el of root.querySelectorAll("[data-on-for]")) {
      el.classList.toggle("on", !!this._isOn(el.dataset.onFor));
    }
  }

  _render() {
    const root = this.shadowRoot;
    const scrollers = [...root.querySelectorAll(".scroll")].map((e) => e.scrollTop);
    root.textContent = "";
    root.append(h("style", {}, STYLE));
    if (!this._dashboards) { root.append(h("div", { class: "loading" }, "Chargement…")); return; }

    root.append(
      h("header", {},
        h("ha-menu-button", { ".hass": this._hass, ".narrow": this._narrow }),
        h("div", { class: "title" }, "TV Freebox"),
        h("nav", {},
          h("button", { class: this._view === "editor" ? "tab active" : "tab", onclick: () => { this._view = "editor"; this._render(); } }, "Dashboards"),
          h("button", { class: this._view === "tvs" ? "tab active" : "tab", onclick: () => { this._view = "tvs"; this._render(); } }, `Players (${this._tvs.length})`),
        ),
        h("div", { class: "spacer" }),
        this._msg ? h("div", { class: this._msgErr ? "msg err" : "msg" }, this._msg) : null,
        h("button", { class: "primary", disabled: !this._dirty(), onclick: () => this._save() },
          this._dirty() ? "Enregistrer" : "Enregistré"),
      ),
      this._view === "tvs" ? this._renderTvs() : this._renderEditor(),
    );
    [...root.querySelectorAll(".scroll")].forEach((e, i) => { e.scrollTop = scrollers[i] || 0; });
  }

  _renderEditor() {
    if (!this._dashboards.length) return h("div", { class: "empty" }, this._msg);
    if (this._dash >= this._dashboards.length) this._dash = 0;
    const dash = this._cur;
    return h("main", {},
      h("section", { class: "left scroll" },
        h("div", { class: "tabs" },
          this._dashboards.map((d, i) => h("button", {
            class: i === this._dash ? "dash active" : "dash",
            onclick: () => { this._dash = i; this._sel = null; this._render(); },
          }, d.icon ? h("ha-icon", { icon: d.icon }) : null, `${i + 1}. ${d.title}`)),
          h("button", { class: "dash add", onclick: () => this._addDashboard() }, "+ Dashboard"),
        ),
        this._renderPreview(dash),
        h("p", { class: "hint" },
          "Glissez une tuile pour la déplacer. Sur la TV : flèches pour naviguer, OK pour agir, ⓘ pour les réglages fins, P+/P- ou chiffres pour changer de dashboard. ",
          "La ligne pointillée marque le bas de l'écran (le reste défile)."),
      ),
      h("aside", { class: "scroll" }, this._sel ? this._renderTileForm() : this._renderDashForm()),
    );
  }

  _renderPreview(dash) {
    const cols = dash.columns;
    const metrics = rowMetrics(dash.tiles, cols);
    const height = SCREEN.top + metrics.total + SCREEN.bottom;
    const fold = SCREEN.height;
    const tv = h("div", { class: "tv", style: { aspectRatio: `${SCREEN.width} / ${Math.max(SCREEN.height, height)}` } });
    const pct = (v, total) => `${(v / total) * 100}%`;
    const H = Math.max(SCREEN.height, height);

    tv.append(h("div", { class: "tvbar", style: { height: pct(SCREEN.top - 20, H) } },
      h("span", { class: "tvtitle" }, dash.title),
      h("span", { class: "tvdots" }, this._dashboards.map((d, i) => h("i", { class: i === this._dash ? "cur" : "" }))),
    ));
    if (H > fold) tv.append(h("div", { class: "fold", style: { top: pct(fold, H) } }));

    for (const t of dash.tiles) {
      const type = effectiveType(t);
      const r = tileRect(t, cols, metrics);
      const x = r.x, y = SCREEN.top + r.y, w = r.w, hh = r.h;
      const style = { left: pct(x, SCREEN.width), top: pct(y, H), width: pct(w, SCREEN.width), height: pct(hh, H) };
      if (t.color) style["--accent"] = t.color;
      const st = this._hass.states[t.entity];
      const el = h("div", {
        class: `tile t-${type}${this._sel === t.id ? " sel" : ""}${type !== "header" && this._isOn(t.entity) ? " on" : ""}`,
        "data-on-for": type !== "header" ? t.entity : null,
        style, draggable: "true",
        onclick: () => { this._sel = t.id; this._render(); },
        ondragstart: (e) => { this._dragId = t.id; e.dataTransfer.effectAllowed = "move"; },
        ondragover: (e) => e.preventDefault(),
        ondrop: (e) => { e.preventDefault(); this._drop(t.id); },
      });
      if (type === "header") {
        el.append(h("span", { class: "hname" }, t.name || "Titre"));
      } else if (type === "camera" && st && st.attributes.entity_picture) {
        el.append(h("img", { src: st.attributes.entity_picture, alt: "" }), h("span", { class: "camname" }, this._name(t)));
        const nCamLinks = (t.links || []).filter(Boolean).length;
        if (nCamLinks) el.append(h("span", { class: "badge" }, `+${nCamLinks}`));
      } else {
        el.append(
          h("div", { class: "ic" }, this._icon(t)),
          h("div", { class: "nm" }, this._name(t)),
          h("div", { class: "st", "data-state-for": t.entity }, this._stateText(t.entity)),
        );
        const nLinks = (t.links || []).filter(Boolean).length;
        if (nLinks) el.append(h("span", { class: "badge", title: `${nLinks} action(s) liée(s)` }, `+${nLinks}`));
        if (type === "sensor" && t.graph) {
          el.insertAdjacentHTML("beforeend",
            '<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none"><path d="M0,22 C15,18 25,26 40,16 S65,8 80,14 S95,6 100,9" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>');
        }
      }
      tv.append(el);
    }
    if (!dash.tiles.length) {
      tv.append(h("div", { class: "tvempty" }, "Dashboard vide : ajoutez des tuiles ou une pièce entière à droite."));
    }
    return tv;
  }

  _renderDashForm() {
    const dash = this._cur;
    const areas = Object.values(this._hass.areas || {}).sort((a, b) => a.name.localeCompare(b.name));
    let areaSel;
    return h("div", { class: "form" },
      h("h3", {}, "Dashboard"),
      h("label", {}, "Nom",
        h("input", { value: dash.title, maxlength: "30", oninput: (e) => { dash.title = e.target.value; }, onchange: () => this._render() })),
      h("label", {}, "Icône (facultatif, ex. mdi:sofa)",
        h("input", { value: dash.icon || "", placeholder: "mdi:home", onchange: (e) => { dash.icon = e.target.value.trim(); this._render(); } })),
      h("label", {}, "Colonnes",
        h("select", { onchange: (e) => this._change(() => { dash.columns = +e.target.value; }) },
          [3, 4, 5, 6, 7, 8].map((n) => h("option", { value: n, selected: n === dash.columns }, `${n} colonnes (${Math.floor(visibleRows(n))} rangées visibles)`)))),
      h("div", { class: "row" },
        h("button", { onclick: () => this._moveDashboard(-1), disabled: this._dash === 0 }, "◀ Avant"),
        h("button", { onclick: () => this._moveDashboard(1), disabled: this._dash === this._dashboards.length - 1 }, "Après ▶"),
        h("button", { class: "danger", onclick: () => this._removeDashboard() }, "Supprimer"),
      ),
      h("h3", {}, "Ajouter"),
      h("div", { class: "row" },
        h("button", { class: "primary", onclick: () => this._addTile() }, "+ Tuile"),
        h("button", { onclick: () => this._addTile("", "header") }, "+ Titre de section"),
      ),
      areas.length ? h("label", {}, "Toute une pièce",
        h("div", { class: "row" },
          areaSel = h("select", {}, areas.map((a) => h("option", { value: a.area_id }, a.name))),
          h("button", { onclick: () => this._addArea(areaSel.value) }, "Ajouter"))) : null,
      h("p", { class: "hint" }, `${dash.tiles.length} tuile(s). Cliquez une tuile de l'aperçu pour la modifier.`),
    );
  }

  _renderTileForm() {
    const dash = this._cur;
    const t = dash.tiles.find((x) => x.id === this._sel);
    if (!t) { this._sel = null; return this._renderDashForm(); }
    const type = effectiveType(t);
    const list = h("datalist", { id: "entities" }, this._entityOptions().map((o) => h("option", { value: o.id }, o.name)));
    const set = (k, v, repack = false) => { t[k] = v; repack ? this._change(() => {}) : this._render(); };
    const idx = dash.tiles.indexOf(t);

    return h("div", { class: "form" },
      h("div", { class: "row between" },
        h("h3", {}, type === "header" ? "Titre de section" : "Tuile"),
        h("button", { class: "link", onclick: () => { this._sel = null; this._render(); } }, "✕ Fermer"),
      ),
      type !== "header" ? h("label", {}, "Entité",
        h("input", { id: "f-entity", list: "entities", value: t.entity, placeholder: "Rechercher : salon, light.…",
          onchange: (e) => {
            const v = e.target.value.trim();
            t.entity = v;
            if (t.type === "auto") Object.assign(t, defaultSize(defaultType(v), dash.columns));
            this._change(() => {});
          } }), list,
        t.entity && !this._hass.states[t.entity] ? h("span", { class: "warn" }, "Entité introuvable") : null) : null,
      h("label", {}, "Type",
        h("select", { onchange: (e) => set("type", e.target.value, true) },
          TYPES.map(([v, l]) => h("option", { value: v, selected: v === (t.type || "auto") }, v === "auto" && t.entity ? `${l} (${TYPES.find((x) => x[0] === defaultType(t.entity))[1]})` : l)))),
      h("label", {}, type === "header" ? "Texte" : "Nom affiché (vide = nom de l'entité)",
        h("input", { value: t.name, maxlength: "60", oninput: (e) => { t.name = e.target.value; }, onchange: () => this._render() })),
      type !== "header" ? h("label", {}, "Icône (vide = icône de l'entité)",
        h("div", { class: "row" },
          h("input", { value: t.icon, placeholder: "mdi:lightbulb", onchange: (e) => set("icon", e.target.value.trim()) }),
          h("span", { class: "iconprev" }, this._icon(t)))) : null,
      h("label", {}, "Couleur quand actif",
        h("div", { class: "colors" }, COLORS.map((c) => h("button", {
          class: t.color === c ? "sw cur" : "sw", style: { background: c || "var(--primary-color)" },
          title: c || "Couleur par défaut", onclick: () => set("color", c),
        }, c ? "" : "A")))),
      type === "sensor" ? h("label", {}, "Graphique (valeurs numériques)",
        h("select", { onchange: (e) => set("graph", +e.target.value) },
          [[0, "Aucun"], [6, "6 heures"], [24, "24 heures"], [48, "48 heures"], [168, "7 jours"]].map(([v, l]) =>
            h("option", { value: v, selected: (t.graph || 0) === v }, l)))) : null,
      type !== "header" ? h("div", { class: "linkbox" },
        h("div", { class: "lbl" }, "Actions liées"),
        h("p", { class: "hint" }, "Boutons affichés dans le panneau Info et sur la caméra en plein écran (ex. portail, serrure, éclairage)."),
        (t.links || []).map((eid, i) => h("div", { class: "row" },
          h("input", { list: "entities", value: eid, placeholder: "Rechercher une entité…", "data-link": i,
            onchange: (e) => { t.links[i] = e.target.value.trim(); this._render(); } }),
          h("span", { class: "iconprev" }, eid && this._hass.states[eid] ? this._icon({ entity: eid }) : ""),
          h("button", { class: "link", title: "Retirer", onclick: () => { t.links.splice(i, 1); this._render(); } }, "✕"))),
        (t.links || []).length < 4 ? h("button", { onclick: () => {
          t.links = (t.links || []).concat([""]); this._render();
          const inputs = this.shadowRoot.querySelectorAll("[data-link]"); if (inputs.length) inputs[inputs.length - 1].focus();
        } }, "+ Ajouter une action") : null) : null,
      h("div", { class: "row" },
        h("label", {}, "Largeur",
          h("select", { onchange: (e) => set("w", +e.target.value, true) },
            Array.from({ length: dash.columns }, (_, i) => i + 1).map((n) => h("option", { value: n, selected: n === t.w }, n)))),
        type === "header" ? null : h("label", {}, "Hauteur",
          h("select", { onchange: (e) => set("h", +e.target.value, true) },
            [1, 2, 3, 4].map((n) => h("option", { value: n, selected: n === t.h }, n)))),
      ),
      h("div", { class: "row" },
        h("button", { onclick: () => this._move(t.id, -1), disabled: idx === 0 }, "◀ Avant"),
        h("button", { onclick: () => this._move(t.id, 1), disabled: idx === dash.tiles.length - 1 }, "Après ▶"),
      ),
      h("div", { class: "row" },
        h("button", { onclick: () => { const c = { ...clone(t), id: uid() }; this._change(() => dash.tiles.splice(idx + 1, 0, c)); this._sel = c.id; this._render(); } }, "Dupliquer"),
        h("button", { class: "danger", onclick: () => this._removeTile(t.id) }, "Supprimer"),
      ),
      h("p", { class: "hint" }, HELP[type] || ""),
    );
  }

  _renderTvs() {
    let code, name;
    const fmt = (s) => (s ? new Date(s * 1000).toLocaleString() : "jamais");
    return h("main", { class: "single" },
      h("section", { class: "card" },
        h("h3", {}, "Associer un Freebox Player"),
        h("ol", {},
          h("li", {}, "Installez l'app Domus sur le Player et ouvrez-la."),
          h("li", {}, "Saisissez l'adresse de Home Assistant avec la télécommande."),
          h("li", {}, "Recopiez ici le code à 6 chiffres affiché sur la TV.")),
        h("div", { class: "row" },
          code = h("input", { class: "code", inputmode: "numeric", maxlength: "7", placeholder: "123 456",
            onkeydown: (e) => { if (e.key === "Enter") this._pair(code.value, name.value); } }),
          name = h("input", { placeholder: "Nom (ex. TV salon)", maxlength: "40" }),
          h("button", { class: "primary", onclick: () => this._pair(code.value, name.value) }, "Associer"),
        ),
        h("p", { class: "hint" }, "Le Player reçoit un jeton d'accès longue durée lié à votre compte. Vous pouvez le retirer ici à tout moment."),
      ),
      h("section", { class: "card" },
        h("h3", {}, "Players associés"),
        this._tvs.length ? h("table", {},
          h("tr", {}, h("th", {}, "Nom"), h("th", {}, "Associé le"), h("th", {}, "Dernier contact"), h("th", {})),
          this._tvs.map((tv) => h("tr", {},
            h("td", {}, tv.name, tv.valid ? "" : h("span", { class: "warn" }, " (jeton supprimé)")),
            h("td", {}, fmt(tv.created)),
            h("td", {}, fmt(tv.last_seen)),
            h("td", { class: "actions" },
              h("button", { onclick: () => this._rename(tv) }, "Renommer"),
              h("button", { class: "danger", onclick: () => this._revoke(tv) }, "Retirer")),
          ))) : h("p", { class: "hint" }, "Aucun Player associé pour l'instant."),
      ),
    );
  }
}

const HELP = {
  light: "OK allume/éteint. ⓘ ouvre le réglage : ◀ ▶ changent la luminosité.",
  toggle: "OK allume/éteint.",
  button: "OK lance la scène, le script ou le bouton.",
  sensor: "Affiche la valeur en grand, avec une courbe si « Graphique » est choisi. ⓘ montre le détail et la courbe des dernières 24 h.",
  cover: "OK ouvre/ferme (ou démarre le portail). ⓘ : ouvrir, stop, fermer, position avec ◀ ▶.",
  climate: "◀ ▶ dans ⓘ changent la consigne ; OK change le mode.",
  camera: "Image rafraîchie toutes les 3 s (chaque seconde en plein écran). OK l'affiche en plein écran, avec les actions liées en bas de l'image.",
  lock: "OK verrouille/déverrouille (confirmation demandée sur la TV).",
  media: "OK lecture/pause. ⓘ : piste, volume.",
  header: "Un titre pour séparer les groupes de tuiles.",
};

const STYLE = `
:host { display:block; height:100%; background:var(--primary-background-color); color:var(--primary-text-color);
  font-family:var(--paper-font-body1_-_font-family, Roboto, sans-serif); }
header { display:flex; align-items:center; gap:12px; height:56px; padding:0 12px; background:var(--app-header-background-color, var(--primary-color));
  color:var(--app-header-text-color, #fff); position:sticky; top:0; z-index:2; }
.title { font-size:20px; }
nav { display:flex; gap:4px; margin-left:16px; }
.tab { background:transparent; color:inherit; border:0; padding:8px 14px; border-radius:18px; opacity:.8; }
.tab.active { background:rgba(255,255,255,.18); opacity:1; }
.spacer { flex:1; }
.msg { font-size:13px; background:rgba(0,0,0,.25); padding:6px 10px; border-radius:6px; max-width:40vw; }
.msg.err { background:var(--error-color, #db4437); }
button { font:inherit; cursor:pointer; border-radius:8px; border:1px solid var(--divider-color); background:var(--card-background-color);
  color:var(--primary-text-color); padding:7px 12px; }
button:disabled { opacity:.45; cursor:default; }
button.primary { background:var(--primary-color); color:var(--text-primary-color, #fff); border-color:transparent; }
header button.primary { background:#fff; color:var(--primary-color); }
button.danger { color:var(--error-color, #db4437); }
button.link { border:0; background:none; color:var(--secondary-text-color); }
main { display:grid; grid-template-columns:minmax(0,1fr) 340px; height:calc(100vh - 56px); }
main.single { display:block; padding:24px; max-width:900px; overflow:auto; }
.left { padding:16px 20px; overflow:auto; }
aside { border-left:1px solid var(--divider-color); background:var(--card-background-color); overflow:auto; }
.tabs { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; }
.dash { display:flex; align-items:center; gap:6px; }
.dash.active { border-color:var(--primary-color); color:var(--primary-color); font-weight:500; }
.dash ha-icon { --mdc-icon-size:18px; }
.tv { position:relative; width:100%; max-width:1100px; background:linear-gradient(160deg,#141a24,#0b0e14 60%); border-radius:10px;
  overflow:hidden; box-shadow:0 4px 18px rgba(0,0,0,.35); container-type:inline-size; color:#e8ecf2; }
.tvbar { position:absolute; left:3.1%; right:3.1%; top:2%; display:flex; align-items:center; justify-content:space-between; }
.tvtitle { font-size:2.6cqw; font-weight:600; }
.tvdots i { display:inline-block; width:.8cqw; height:.8cqw; border-radius:50%; background:#3a4352; margin-left:.5cqw; }
.tvdots i.cur { background:#fff; }
.fold { position:absolute; left:0; right:0; border-top:2px dashed rgba(255,255,255,.35); }
.tvempty { position:absolute; inset:30% 10%; text-align:center; color:#8792a2; font-size:1.8cqw; }
.tile { position:absolute; box-sizing:border-box; border-radius:1cqw; background:#1d2430; padding:1cqw 1.1cqw; cursor:pointer;
  display:flex; flex-direction:column; overflow:hidden; border:2px solid transparent; --accent:#f5a623; transition:border-color .1s; }
.tile:hover { border-color:rgba(255,255,255,.3); }
.tile.sel { border-color:var(--primary-color); box-shadow:0 0 0 3px rgba(3,169,244,.35); }
.tile.on .ic { color:var(--accent); }
.tile .ic { color:#9aa5b5; } .tile .ic ha-icon, .tile .ic ha-state-icon { --mdc-icon-size:3cqw; }
.tile .nm { margin-top:auto; font-size:1.25cqw; color:#c5ccd6; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tile .st { font-size:1.6cqw; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tile.t-sensor .st { font-size:2.2cqw; }
.tile .badge { position:absolute; top:.6cqw; right:.7cqw; font-size:1cqw; padding:.15cqw .5cqw; border-radius:1cqw; background:rgba(255,255,255,.14); color:#fff; }
.linkbox { display:flex; flex-direction:column; gap:6px; }
.linkbox .lbl { font-size:13px; color:var(--secondary-text-color); }
.linkbox .hint { margin:0; }
.tile .spark { position:absolute; left:8%; width:84%; top:22%; height:24%; color:var(--accent); opacity:.6; pointer-events:none; }
.tile.t-header { background:none; padding:0 .3cqw; justify-content:flex-end; }
.tile.t-header .hname { font-size:1.8cqw; font-weight:600; color:#fff; border-bottom:1px solid #2c3442; padding-bottom:.4cqw; }
.tile.t-camera { padding:0; } .tile.t-camera img { width:100%; height:100%; object-fit:cover; }
.tile .camname { position:absolute; left:0; right:0; bottom:0; padding:.6cqw 1cqw; font-size:1.2cqw; background:linear-gradient(transparent,rgba(0,0,0,.7)); }
.form { padding:16px 18px; display:flex; flex-direction:column; gap:12px; }
.form h3 { margin:6px 0 0; font-size:15px; text-transform:uppercase; letter-spacing:.04em; color:var(--secondary-text-color); }
label { display:flex; flex-direction:column; gap:4px; font-size:13px; color:var(--secondary-text-color); flex:1; }
input, select { font:inherit; padding:8px 10px; border-radius:8px; border:1px solid var(--divider-color); background:var(--primary-background-color);
  color:var(--primary-text-color); min-width:0; }
.row { display:flex; gap:8px; align-items:flex-end; flex-wrap:wrap; } .row.between { justify-content:space-between; align-items:center; }
.row > input { flex:1; }
.iconprev { width:36px; height:36px; display:grid; place-items:center; }
.colors { display:flex; gap:6px; flex-wrap:wrap; }
.sw { width:28px; height:28px; padding:0; border-radius:50%; border:2px solid transparent; color:#fff; font-size:11px; }
.sw.cur { border-color:var(--primary-text-color); }
.warn { color:var(--warning-color, #ffa600); font-size:12px; }
.hint { font-size:12.5px; color:var(--secondary-text-color); line-height:1.45; }
.card { background:var(--card-background-color); border-radius:12px; padding:18px 20px; margin-bottom:18px; box-shadow:var(--ha-card-box-shadow, none); border:1px solid var(--divider-color); }
.card ol { padding-left:20px; line-height:1.7; }
input.code { font-size:22px; letter-spacing:.2em; width:150px; flex:none; text-align:center; }
table { width:100%; border-collapse:collapse; } th, td { text-align:left; padding:8px 6px; border-bottom:1px solid var(--divider-color); font-size:14px; }
td.actions { text-align:right; white-space:nowrap; } td.actions button { margin-left:6px; }
.loading, .empty { padding:40px; text-align:center; color:var(--secondary-text-color); }
@media (max-width: 900px) { main { grid-template-columns:1fr; height:auto; } aside { border-left:0; border-top:1px solid var(--divider-color); } }
`;

customElements.define("domus-tv-panel", DomusTvPanel);
