/**
 * The ".mus" records of the pre-1.6 resources (CodecMus / MusInputStream): Ogg Vorbis files
 * XORed with a key stream seeded by the Java hashCode of the bare file name ("13.mus"). Each
 * output byte is the input byte XOR (key >> 8), and the key then advances with the decoded
 * (signed) byte. "13.mus" decodes to exactly the bytes of "13.ogg".
 */
export function decodeMus(data: ArrayBuffer | Uint8Array, fileName: string): Uint8Array {
  const src = data instanceof Uint8Array ? data : new Uint8Array(data);
  const out = new Uint8Array(src.length);
  let hash = javaStringHash(urlFileName(fileName));
  for (let i = 0; i < src.length; i++) {
    const b = ((src[i] ^ (hash >> 8)) << 24) >> 24;
    out[i] = b & 255;
    hash = (Math.imul(hash, 498729871) + Math.imul(85731, b)) | 0;
  }
  return out;
}

/** java.lang.String.hashCode over UTF-16 code units. */
export function javaStringHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

/** The last path segment. */
function urlFileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}
