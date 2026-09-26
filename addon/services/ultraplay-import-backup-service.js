"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function safeId(value) { return typeof value === "string" && /^[A-Za-z0-9_-]{20,80}$/.test(value) ? value : null; }
function tokenHash(token) { return crypto.createHash("sha256").update(String(token || "")).digest("hex").slice(0,32); }

function createUltraPlayImportBackupStore({dataDir = process.env.DATA_DIR || "/data", clock = Date.now} = {}) {
  const root = path.join(dataDir,"ultraplay-import-backups");
  function accountDir(token) { return path.join(root,tokenHash(token)); }
  function ensure(dir) { fs.mkdirSync(dir,{recursive:true,mode:0o700}); try{fs.chmodSync(dir,0o700)}catch{} }
  function prune(dir) {
    let files=[]; try{files=fs.readdirSync(dir).filter(n=>/^[A-Za-z0-9_-]{20,80}\.json$/.test(n)).map(n=>({n,t:fs.statSync(path.join(dir,n)).mtimeMs})).sort((a,b)=>b.t-a.t)}catch{return}
    for(const row of files.slice(10)) try{fs.unlinkSync(path.join(dir,row.n))}catch{}
  }
  function save(token, profileId, entries, meta = {}) {
    const dir=accountDir(token);ensure(root);ensure(dir);const id=crypto.randomBytes(18).toString("base64url");
    const payload={v:1,id,tokenHash:tokenHash(token),profileId:profileId||null,createdAt:new Date(clock()).toISOString(),entries,meta};
    const file=path.join(dir,id+".json");fs.writeFileSync(file,JSON.stringify(payload),{encoding:"utf8",mode:0o600,flag:"wx"});try{fs.chmodSync(file,0o600)}catch{}prune(dir);return {id,createdAt:payload.createdAt};
  }
  function load(token, profileId, id) {
    id=safeId(id);if(!id)return null;const file=path.join(accountDir(token),id+".json");let payload;try{payload=JSON.parse(fs.readFileSync(file,"utf8"))}catch{return null}
    if(payload?.v!==1||payload.tokenHash!==tokenHash(token)||(payload.profileId||null)!==(profileId||null)||!payload.entries||typeof payload.entries!=="object")return null;
    return payload;
  }
  return {save,load};
}

module.exports={createUltraPlayImportBackupStore};
