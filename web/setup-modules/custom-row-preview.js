async function previewCustomCatalog(){
  const modal = document.getElementById("customCatalogModal");
  if(!modal) return;

  const panel = modal.querySelector(":scope > div") || modal;

  let target = document.getElementById("customCatalogPreview");
  if(!target){
    target = document.createElement("div");
    target.id = "customCatalogPreview";
    target.style.cssText = "margin-top:14px;width:100%;clear:both;";

    const saveBtn = Array.from(panel.querySelectorAll("button"))
      .find(b => /save catalog/i.test(b.textContent || ""));

    const buttonRow = saveBtn ? saveBtn.parentElement : null;
    if(buttonRow && buttonRow.parentElement){
      buttonRow.parentElement.insertBefore(target, buttonRow);
    } else {
      panel.appendChild(target);
    }
  }

  let type = (document.getElementById("customCatalogType") || {}).value || "movie";
  type = String(type).toLowerCase();
  if(type === "movies") type = "movie";
  if(type === "tv" || type === "shows") type = "series";

  const ai = window.__ultraMaxAiPreviewRow || {};
  const genre = String((document.getElementById("customTmdbGenre") || {}).value || ai.withGenres || ai.genre || "").trim();
  const minRating = String((document.getElementById("customTmdbRating") || {}).value || ai.voteAverageGte || ai.minRating || "").trim();
  const yearFrom = String((document.getElementById("customTmdbYearFrom") || {}).value || ai.yearFrom || "").trim();
  const yearTo = String((document.getElementById("customTmdbYearTo") || {}).value || ai.yearTo || "").trim();

  const qs = new URLSearchParams();
  qs.set("type", type);
  qs.set("genre", genre);
  qs.set("minRating", minRating);
  qs.set("yearFrom", yearFrom);
  qs.set("yearTo", yearTo);
  qs.set("_", Date.now());

  const url = "/preview/tmdb?" + qs.toString();
  console.log("Ultra MAX preview URL:", url);

  target.innerHTML = umT('setup.assetLibrary.loadingPreviewWithUrl', '<div style="color:#aaa;padding:10px;">Loading preview...<br><small>{url}</small></div>', {url: url});

  try{
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    const items = data.results || [];

    if(!items.length){
      target.innerHTML = umT('setup.assetLibrary.noPreviewTitlesFoundWithUrl', '<div style="color:#ffb4b4;padding:10px;">No preview titles found.<br><small>{url}</small></div>', {url: url});
      return;
    }

    target.innerHTML = `
      <div style="font-weight:900;color:#fff;margin:12px 0 8px;">Preview Titles</div>
      
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(95px,1fr));gap:10px;width:100%;">
        ${items.slice(0,12).map(x => {
          const title = x.title || x.name || "Untitled";
          const poster = x.poster_path
            ? "https://image.tmdb.org/t/p/w342" + x.poster_path
            : (x.poster || x.image || "");
          return `
            <div style="background:#111;border:1px solid #3a3a55;border-radius:10px;overflow:hidden;">
              ${poster ? `<img src="${poster}" style="width:100%;aspect-ratio:2/3;object-fit:cover;display:block;">` : `<div style="aspect-ratio:2/3;background:#222;"></div>`}
              <div style="padding:7px;font-size:11px;color:#eee;line-height:1.2;">${title}</div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }catch(err){
    console.error(err);
    target.innerHTML = umT('setup.assetLibrary.previewFailedWithError', '<div style="color:#ffb4b4;padding:10px;">Preview failed: {message}<br><small>{url}</small></div>', {message: (err.message || err), url: url});
  }
}
