function ultraMaxSetValue(id, value){
  const el = document.getElementById(id);
  if(!el) return;
  const v = value == null ? "" : String(value);
  el.value = v;
  el.defaultValue = v;
  el.setAttribute("value", v);
  el.dispatchEvent(new Event("input", { bubbles:true }));
  el.dispatchEvent(new Event("change", { bubbles:true }));
}

async function generateAiCustomRow(){
  return generateAiCustomRowsIntoModal(1);
}

async function generateFiveAiRows(){
  return generateAiCustomRowsIntoModal(5);
}

async function generateAiCustomRowsIntoModal(count){
  const input = document.getElementById("aiPromptInput");
  const prompt = input ? input.value.trim() : "";

  if(!prompt){
    alert(umT('setup.assetLibrary.typeARowIdeaFirst', "Type a row idea first."));
    return;
  }

  const googleAiKey =
    (document.getElementById("googleAiKey") && document.getElementById("googleAiKey").value.trim()) ||
    (document.querySelector("[name='googleAiKey']") && document.querySelector("[name='googleAiKey']").value.trim()) ||
    "";

  const traktUser =
    (document.getElementById("traktUser") && document.getElementById("traktUser").value.trim()) ||
    (document.querySelector("[name='traktUser']") && document.querySelector("[name='traktUser']").value.trim()) ||
    "";

  try{
    const res = await fetch(API_BASE+"/api/ai/custom-row", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, count, googleAiKey, traktUser })
    });

    const data = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(data.error || data.details || "AI row request failed");

    const row = Array.isArray(data.rows) ? data.rows[0] : null;
    if(!row) throw new Error("AI returned no row");

    if(typeof createCustomCatalog === "function"){
      createCustomCatalog();
    } else if(typeof openCustomCatalogModal === "function"){
      openCustomCatalogModal();
    } else {
      throw new Error("Custom catalog modal function not found");
    }

    setTimeout(() => {
      ultraMaxSetValue("customCatalogName", row.name || "AI Custom Row");
      ultraMaxSetValue("customCatalogType", row.type || "movie");
      ultraMaxSetValue("customCatalogSource", "tmdb");

      if(typeof renderCustomSourceFields === "function") renderCustomSourceFields();

      setTimeout(() => {
        ultraMaxSetValue("customTmdbGenre", row.withGenres || row.genre || "");
        ultraMaxSetValue("customTmdbRating", row.voteAverageGte || row.minRating || "");
        ultraMaxSetValue("customTmdbYearFrom", row.yearFrom || "");
        ultraMaxSetValue("customTmdbYearTo", row.yearTo || "");
        window.__ultraMaxAiPreviewRow = row;

        const search =
          row.search ||
          row.query ||
          prompt.replace(/\bmovies\b|\bseries\b|\bshows\b|\babove\b|\brating\b|\bover\b|\bunder\b|\bafter\b|\bbefore\b|\bon\b|\d+(\.\d+)?/gi, "").trim();

        ultraMaxSetValue("customCatalogValue", search);

        setTimeout(() => {
          if(typeof previewCustomCatalog === "function"){
            previewCustomCatalog(row);
          } else {
            const previewBtn = Array.from(document.querySelectorAll("button"))
              .find(b => b.textContent.trim().toLowerCase() === "preview");
            if(previewBtn) previewBtn.click();
          }
        }, 300);
      }, 150);
    }, 150);

  } catch(err){
    console.error(err);
    alert(umT('setup.assetLibrary.aiRowGenerationFailed', "AI row generation failed: ") + (err.message || err));
  }
}
