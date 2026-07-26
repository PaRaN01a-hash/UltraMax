async function rdApi(apiKey, path, options = {}){
  const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

  const resp = await fetch("https://api.real-debrid.com/rest/1.0" + path, {
    ...options,
    headers: {
      "Authorization": "Bearer " + apiKey,
      ...(options.headers || {})
    }
  });

  const text = await resp.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch(e) {
    data = text;
  }

  if(!resp.ok){
    throw new Error("RD API " + resp.status + ": " + String(text).slice(0, 200));
  }

  return data;
}

module.exports = {
  rdApi
};

async function addMagnetToRD(apiKey, magnet){
  return await rdApi(apiKey, "/torrents/addMagnet", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "magnet=" + encodeURIComponent(magnet)
  });
}

async function getRDTorrentInfo(apiKey, id){
  return await rdApi(apiKey, "/torrents/info/" + id);
}

async function selectRDFile(apiKey, id, fileIds){
  return await rdApi(apiKey, "/torrents/selectFiles/" + id, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "files=" + fileIds
  });
}

async function unrestrictRDLink(apiKey, link){
  return await rdApi(apiKey, "/unrestrict/link", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "link=" + encodeURIComponent(link)
  });
}

module.exports = {
  rdApi,
  addMagnetToRD,
  getRDTorrentInfo,
  selectRDFile,
  unrestrictRDLink
};
