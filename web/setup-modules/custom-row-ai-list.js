async function generateFiveAiRowsList(){
  const input = document.getElementById("aiPromptInput");
  const prompt = input ? input.value.trim() : "";

  if(!prompt){
    alert(umT('setup.assetLibrary.typeARowIdeaFirst2', "Type a row idea first."));
    return;
  }

  try{
    const res = await fetch(API_BASE+"/api/ai/custom-row", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, count: 5 })
    });

    const data = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(data.error || data.details || "AI row request failed");

    const rows = Array.isArray(data.rows) ? data.rows : [];
    if(!rows.length) throw new Error(umT('setup.aiRowPicker.noRowsGenerated','No rows generated.'));

    const old = document.getElementById("aiFiveRowPicker");
    if(old) old.remove();

    const modal = document.createElement("div");
    modal.id = "aiFiveRowPicker";
    modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.86);z-index:10000;padding:18px;overflow:auto;";

    modal.innerHTML = `
      <div style="max-width:980px;margin:20px auto;background:#111;border:1px solid #333;border-radius:14px;padding:16px;color:#fff;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;">
          <div>
            <div style="font-weight:900;font-size:18px;">${umT('setup.aiRowPicker.title','✨ Pick AI Rows')}</div>
            <div style="font-size:12px;color:#aaa;">${umT('setup.aiRowPicker.description','Select the rows you want, preview them, then add to your custom catalogs.')}</div>
          </div>
          <button type="button" id="aiFiveClose" style="padding:8px 12px;border-radius:8px;border:1px solid #333;background:#1b1b1b;color:#fff;">${umT('setup.aiRowPicker.close','Close')}</button>
        </div>

        <div id="aiFiveRows" style="display:grid;gap:14px;"></div>

        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">
          <button type="button" id="aiFiveAddAll" style="padding:10px 14px;border-radius:9px;border:1px solid #444;background:#191919;color:#fff;font-weight:800;">${umT('setup.aiRowPicker.addAll','Add All')}</button>
          <button type="button" id="aiFiveAddSelected" style="padding:10px 14px;border-radius:9px;border:0;background:#fff;color:#000;font-weight:900;">${umT('setup.aiRowPicker.addSelected','Add Selected')}</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const list = modal.querySelector("#aiFiveRows");

    function normaliseRow(row, i){
      row.id = row.id || ("custom_" + Date.now() + "_" + i);
      row.name = row.name || ("AI Row " + (i + 1));
      row.type = row.type || "movie";
      row.source = "tmdb";
      row.config = row.config || {
        genre: row.withGenres || row.genre || "",
        minRating: row.voteAverageGte || row.minRating || "",
        yearFrom: row.yearFrom || "",
        yearTo: row.yearTo || ""
      };
      return row;
    }

    async function loadPreview(row, box){
      const qs = new URLSearchParams({
        type: row.type || "movie",
        genre: row.withGenres || row.genre || row.config?.genre || "",
        minRating: row.voteAverageGte || row.minRating || row.config?.minRating || "",
        yearFrom: row.yearFrom || row.config?.yearFrom || "",
        yearTo: row.yearTo || row.config?.yearTo || ""
      });

      try{
        const r = await fetch(API_BASE+"/preview/tmdb?" + qs.toString(), { cache: "no-store" });
        const d = await r.json();
        const items = (d.results || []).slice(0, 6);

        if(!items.length){
          box.innerHTML = umT('setup.assetLibrary.noPreviewTitlesFound', '<div style="color:#ffb4b4;font-size:12px;">No preview titles found.</div>');
          return;
        }

        box.innerHTML = `
          <div style="display:flex;gap:8px;overflow:auto;padding-bottom:4px;">
            ${items.map(x => {
              const title = x.title || x.name || "Untitled";
              const poster = x.poster_path ? "https://image.tmdb.org/t/p/w185" + x.poster_path : "";
              return `
                <div style="width:82px;flex:0 0 82px;background:#151515;border:1px solid #292929;border-radius:9px;overflow:hidden;">
                  ${poster ? `<img src="${poster}" style="width:100%;aspect-ratio:2/3;object-fit:cover;display:block;">` : `<div style="aspect-ratio:2/3;background:#222;"></div>`}
                  <div style="font-size:10px;line-height:1.2;padding:5px;color:#eee;">${title}</div>
                </div>
              `;
            }).join("")}
          </div>
        `;
      }catch(err){
        box.innerHTML = umT('setup.assetLibrary.previewFailed', '<div style="color:#ffb4b4;font-size:12px;">Preview failed.</div>');
      }
    }

    rows.map(normaliseRow).forEach((row, i) => {
      const card = document.createElement("div");
      card.style.cssText = "border:1px solid #2d2d2d;border-radius:12px;background:#0b0b0b;padding:12px;";

      const genre = row.withGenres || row.genre || row.config?.genre || "";
      const rating = row.voteAverageGte || row.minRating || row.config?.minRating || "";
      const yf = row.yearFrom || row.config?.yearFrom || "";
      const yt = row.yearTo || row.config?.yearTo || "";

      card.innerHTML = `
        <label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer;">
          <input type="checkbox" checked data-ai-row-index="${i}" style="margin-top:3px;">
          <div style="min-width:0;width:100%;">
            <div style="font-weight:900;color:#fff;">${row.name}</div>
            <div style="font-size:11px;color:#aaa;margin-top:3px;">
              ${umT('setup.aiRowPicker.meta','{type} · genre {genre} · rating {rating} · years {yearFrom}-{yearTo}',{type:row.type || "movie",genre:genre || "-",rating:rating || "-",yearFrom:yf || "-",yearTo:yt || "-"})}
            </div>
            <div class="ai-five-preview" style="margin-top:10px;color:#aaa;font-size:12px;">${umT('setup.aiRowPicker.loadingPreview','Loading preview...')}</div>
            <div style="margin-top:10px;">
              <button type="button" data-open-row="${i}" style="padding:7px 10px;border-radius:8px;border:1px solid #333;background:#181818;color:#fff;">${umT('setup.aiRowPicker.openInBuilder','Open in Builder')}</button>
            </div>
          </div>
        </label>
      `;

      list.appendChild(card);
      loadPreview(row, card.querySelector(".ai-five-preview"));
    });

    function addRows(selectedOnly){
      window.customCatalogs = window.customCatalogs || [];
      rows.forEach((row, i) => {
        const checked = modal.querySelector(`input[data-ai-row-index="${i}"]`)?.checked;
        if(!selectedOnly || checked){
          const item = {
            id: "custom_" + String(row.name || ("ai_row_" + i)).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""),
            name: row.name || ("AI Row " + (i + 1)),
            type: row.type || "movie",
            source: "tmdb",
            config: {
              genre: row.withGenres || row.genre || row.config?.genre || "",
              minRating: row.voteAverageGte || row.minRating || row.config?.minRating || "",
              yearFrom: row.yearFrom || row.config?.yearFrom || "",
              yearTo: row.yearTo || row.config?.yearTo || ""
            },
            createdAt: new Date().toISOString()
          };
          window.customCatalogs.push(item);
        }
      });

      if(typeof renderCustomCatalogList === "function") renderCustomCatalogList();
      if(typeof saveDraftState === "function") saveDraftState();
      modal.remove();
    }

    modal.querySelector("#aiFiveClose").onclick = () => modal.remove();
    modal.querySelector("#aiFiveAddAll").onclick = () => addRows(false);
    modal.querySelector("#aiFiveAddSelected").onclick = () => addRows(true);

    modal.addEventListener("click", e => {
      const btn = e.target.closest("[data-open-row]");
      if(!btn) return;

      const i = Number(btn.getAttribute("data-open-row"));
      const row = rows[i];
      modal.remove();

      if(typeof createCustomCatalog === "function") createCustomCatalog();

      setTimeout(() => {
        ultraMaxSetValue("customCatalogName", row.name || "AI Custom Row");
        ultraMaxSetValue("customCatalogType", row.type || "movie");
        ultraMaxSetValue("customCatalogSource", "tmdb");
        if(typeof renderCustomSourceFields === "function") renderCustomSourceFields();

        setTimeout(() => {
          ultraMaxSetValue("customTmdbGenre", row.withGenres || row.genre || row.config?.genre || "");
          ultraMaxSetValue("customTmdbRating", row.voteAverageGte || row.minRating || row.config?.minRating || "");
          ultraMaxSetValue("customTmdbYearFrom", row.yearFrom || row.config?.yearFrom || "");
          ultraMaxSetValue("customTmdbYearTo", row.yearTo || row.config?.yearTo || "");
          window.__ultraMaxAiPreviewRow = row;
          if(typeof previewCustomCatalog === "function") previewCustomCatalog();
        }, 150);
      }, 150);
    });

  }catch(err){
    console.error(err);
    alert(umT('setup.assetLibrary.generate5RowsFailed', "Generate 5 Rows failed: ") + (err.message || err));
  }
}
