// ════════════════════════════════════════════════════════════════════════════
// bpm.js — find a beat's tempo. FILE METADATA FIRST, then the file name.
//
//   mvBpm.fromName(name)             → number | null   (only if unambiguous)
//   mvBpm.fromBytes(read, size)      → Promise<number|null>
//        read(start, endExclusive) → Promise<Uint8Array>   (random access)
//   mvBpm.fromFile(file)             → Promise<number|null> (File/Blob)
//   mvBpm.fromUrl(url)               → Promise<number|null> (HTTP Range requests)
//   mvBpm.detect({name, file|url})   → Promise<{bpm, source:'fil'|'filnavn'}|null>
//
// Metadata read: MP3 ID3v2 TBPM · WAV «acid» chunk tempo + embedded ID3 chunk
// (often AFTER the audio data, so we jump past it) · FLAC Vorbis BPM=/TEMPO= ·
// MP4/M4A «tmpo». Only the bytes needed are read — never the whole file.
// Plain JS on purpose: the same file runs in Node for scanning the library.
// ════════════════════════════════════════════════════════════════════════════
(function(root){
  'use strict';
  var MIN = 40, MAX = 300;
  // Whole numbers: the Supabase «bpm» column is an integer (92.5 would fail the sync).
  function ok(n){ return typeof n === 'number' && isFinite(n) && n >= MIN && n <= MAX ? Math.round(n) : null; }

  // ── File name ─────────────────────────────────────────────────────────────
  // «sounds like it sounds 140bpm», «WEDO_vox_95bpm_mix2», «BPM 126», «92.5 bpm».
  // Several DIFFERENT values (e.g. «90bpm to 140bpm») → ambiguous → null.
  function fromName(name){
    var s = String(name || '').replace(/\.[a-z0-9]{2,4}$/i, '');
    var found = [], m;
    var re1 = /(?:^|[^0-9.,])(\d{2,3}(?:[.,]\d)?)\s*[-_ ]?\s*bpm(?![a-z])/gi;
    var re2 = /(?:^|[^a-z])bpm\s*[-_:= ]?\s*(\d{2,3}(?:[.,]\d)?)(?![0-9])/gi;
    while ((m = re1.exec(s))) found.push(parseFloat(m[1].replace(',', '.')));
    while ((m = re2.exec(s))) found.push(parseFloat(m[1].replace(',', '.')));
    var vals = found.map(function(n){ return Math.round(n); })
                    .filter(function(n){ return n >= 50 && n <= 250; })
                    .filter(function(n, i, a){ return a.indexOf(n) === i; });
    return vals.length === 1 ? vals[0] : null;
  }

  // ── Byte helpers ──────────────────────────────────────────────────────────
  function str(b, o, n){ var s=''; for (var i=0;i<n && o+i<b.length;i++) s += String.fromCharCode(b[o+i]); return s; }
  function u32le(b,o){ return (b[o] | b[o+1]<<8 | b[o+2]<<16 | b[o+3]<<24) >>> 0; }
  function u32be(b,o){ return ((b[o]<<24) | (b[o+1]<<16) | (b[o+2]<<8) | b[o+3]) >>> 0; }
  function u24be(b,o){ return (b[o]<<16) | (b[o+1]<<8) | b[o+2]; }
  function syncsafe(b,o){ return (b[o]&0x7f)<<21 | (b[o+1]&0x7f)<<14 | (b[o+2]&0x7f)<<7 | (b[o+3]&0x7f); }
  function f32le(b,o){ return new DataView(b.buffer, b.byteOffset + o, 4).getFloat32(0, true); }
  function textFrame(b, o, n){
    // ID3 text: first byte = encoding (0 latin1, 1 UTF-16 BOM, 2 UTF-16BE, 3 UTF-8). Digits only matter.
    var enc = b[o], out = '';
    if (enc === 1 || enc === 2){ for (var i=o+1;i+1<o+n;i+=2){ var c = enc===2 ? (b[i]<<8|b[i+1]) : (b[i]|b[i+1]<<8); if (c===0xFEFF||c===0xFFFE) continue; if (!c) break; out += String.fromCharCode(c); } }
    else { for (var j=o+1;j<o+n;j++){ if (!b[j]) break; out += String.fromCharCode(b[j]); } }
    var m = out.match(/\d+(?:[.,]\d+)?/); return m ? parseFloat(m[0].replace(',', '.')) : null;
  }

  // ID3v2 tag starting at b[0] ("ID3"). Returns TBPM or null.
  function id3(b){
    if (str(b,0,3) !== 'ID3') return null;
    var ver = b[3], size = syncsafe(b,6), end = Math.min(b.length, 10 + size), o = 10;
    if (b[5] & 0x40 && ver >= 3){ o += ver === 4 ? syncsafe(b,10) : u32be(b,10) + 4; }   // extended header
    while (o + (ver === 2 ? 6 : 10) <= end){
      if (ver === 2){
        var id2 = str(b,o,3), sz2 = u24be(b,o+3); if (!/^[A-Z0-9]{3}$/.test(id2) || !sz2) break;
        if (id2 === 'TBP') return ok(textFrame(b, o+6, sz2));
        o += 6 + sz2;
      } else {
        var id = str(b,o,4), sz = ver === 4 ? syncsafe(b,o+4) : u32be(b,o+4); if (!/^[A-Z0-9]{4}$/.test(id) || !sz) break;
        if (id === 'TBPM') return ok(textFrame(b, o+10, sz));
        o += 10 + sz;
      }
    }
    return null;
  }

  // ── Format readers (read = async random access) ────────────────────────────
  async function wav(read, size){
    // Walk RIFF chunks; skip over the audio «data» chunk with a new read instead of loading it.
    var pos = 12, guard = 0;
    while (pos + 8 <= size && guard++ < 64){
      var hdr = await read(pos, Math.min(size, pos + 8)); if (hdr.length < 8) break;
      var id = str(hdr,0,4), len = u32le(hdr,4), body = pos + 8;
      if (id === 'acid' && len >= 24){
        var a = await read(body, body + 24); var t = ok(f32le(a, 20)); if (t) return t;
      } else if ((id === 'id3 ' || id === 'ID3 ') && len > 10){
        var tag = await read(body, Math.min(size, body + Math.min(len, 1 << 20))); var t2 = id3(tag); if (t2) return t2;
      }
      pos = body + len + (len & 1);
    }
    return null;
  }
  async function flac(read, size){
    var pos = 4, guard = 0;
    while (pos + 4 <= size && guard++ < 32){
      var h = await read(pos, pos + 4); var last = h[0] & 0x80, type = h[0] & 0x7f, len = u24be(h,1);
      if (type === 4){
        var b = await read(pos + 4, pos + 4 + Math.min(len, 1 << 20));
        var vlen = b[0] | b[1]<<8 | b[2]<<16 | b[3]<<24, o = 4 + vlen, n = u32le(b,o); o += 4;
        for (var i=0;i<n && o+4<=b.length;i++){
          var cl = u32le(b,o); var kv = str(b,o+4,cl); o += 4 + cl;
          var m = kv.match(/^(?:BPM|TEMPO)=\s*(\d+(?:[.,]\d+)?)/i); if (m) return ok(parseFloat(m[1].replace(',', '.')));
        }
        return null;
      }
      if (last) break; pos += 4 + len;
    }
    return null;
  }
  function tmpoIn(b){
    for (var i=0;i+22<=b.length;i++){   // value sits at i+20..i+21
      if (b[i]===0x74 && b[i+1]===0x6d && b[i+2]===0x70 && b[i+3]===0x6f && str(b,i+8,4) === 'data'){   // «tmpo» … «data»
        return ok((b[i+20]<<8) | b[i+21]);
      }
    }
    return null;
  }
  async function mp4(read, size){
    // «moov» (where tmpo lives) is at the start for web-optimised files, else at the end.
    var head = await read(0, Math.min(size, 262144)); var t = tmpoIn(head); if (t) return t;
    if (size > 262144){ var tail = await read(Math.max(0, size - 262144), size); return tmpoIn(tail); }
    return null;
  }

  async function fromBytes(read, size){
    var b = await read(0, Math.min(size || 16, 16)); if (b.length < 12) return null;
    var magic = str(b,0,4);
    if (str(b,0,3) === 'ID3'){
      var tagSize = 10 + syncsafe(b,6);
      return id3(await read(0, Math.min(size, tagSize, 1 << 20)));
    }
    if (magic === 'RIFF' && str(b,8,4) === 'WAVE') return wav(read, size);
    if (magic === 'fLaC') return flac(read, size);
    if (str(b,4,4) === 'ftyp') return mp4(read, size);
    return null;
  }

  // ── Sources ───────────────────────────────────────────────────────────────
  function fromFile(file){
    if (!file || !file.size) return Promise.resolve(null);
    var read = function(s, e){ return file.slice(s, e).arrayBuffer().then(function(ab){ return new Uint8Array(ab); }); };
    return fromBytes(read, file.size).catch(function(){ return null; });
  }
  async function fromUrl(url){
    if (!/^https?:\/\//i.test(url || '')) return null;
    var size = null;
    var read = async function(s, e){
      var r = await fetch(url, { headers: { Range: 'bytes=' + s + '-' + (e - 1) } });
      if (r.status !== 206) throw new Error('ingen Range-støtte');   // never download whole files
      if (size === null){ var cr = r.headers.get('Content-Range') || ''; var m = cr.match(/\/(\d+)$/); if (m) size = Number(m[1]); }
      return new Uint8Array(await r.arrayBuffer());
    };
    try {
      await read(0, 16);                                   // learn the total size first
      if (!size) return null;
      return await fromBytes(read, size);
    } catch(e){ return null; }
  }
  async function detect(opts){
    var o = opts || {};
    var fromMeta = o.file ? await fromFile(o.file) : (o.url ? await fromUrl(o.url) : null);
    if (fromMeta) return { bpm: fromMeta, source: 'fil' };
    var n = fromName(o.name || (o.file && o.file.name) || '');
    return n ? { bpm: n, source: 'filnavn' } : null;
  }

  var api = { fromName: fromName, fromBytes: fromBytes, fromFile: fromFile, fromUrl: fromUrl, detect: detect };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.mvBpm = api;
})(typeof window !== 'undefined' ? window : globalThis);
