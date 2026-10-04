package dev.polymodels.model;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;
import com.google.gson.internal.Streams;
import com.google.gson.stream.JsonReader;
import com.google.gson.stream.JsonToken;

import java.io.StringReader;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.zip.DataFormatException;
import java.util.zip.Inflater;

/**
 * Reader for the web game's player model files (".mcpm", src/client/model/PlayerModelFormat.ts in
 * the repository), with the same checks as its decodePlayerModel: a file from anywhere can only
 * fail to load, never make the game read outside the file, allocate huge arrays or inflate
 * gigabytes.
 *
 * <p>Layout (little-endian): "MCPM", u32 version (1), u32 header length, the header as UTF-8 JSON,
 * then the payload: one raw-DEFLATE geometry block and the encoded textures (PNG / JPEG / WebP).
 * The geometry block holds, each part 4-byte aligned: uvs (float32 x2), positions (uint16 x3,
 * quantised inside the header's bounds), normals (int8 x3), joints (uint8 x4, part indices),
 * weights (uint8 x4, summing to 255), indices (uint16, or uint32 with wideIndices).
 *
 * <p>Model space: blocks, +Y up, feet on y = 0, 1.8 tall, facing +Z, the right hand towards -X.
 */
public final class McpmFormat {
    public static final int PART_HEAD = 0;
    public static final int PART_BODY = 1;
    public static final int PART_RIGHT_ARM = 2;
    public static final int PART_LEFT_ARM = 3;
    public static final int PART_RIGHT_LEG = 4;
    public static final int PART_LEFT_LEG = 5;
    public static final int PART_COUNT = 6;

    public static final int ALPHA_OPAQUE = 0;
    public static final int ALPHA_MASK = 1;
    public static final int ALPHA_BLEND = 2;

    public static final int MAX_VERTICES = 400_000;
    public static final int MAX_INDICES = 600_000;
    public static final int MAX_GROUPS = 256;
    public static final int MAX_MATERIALS = 64;
    public static final int MAX_TEXTURES = 16;
    public static final int MAX_TEXTURE_BYTES = 16 * 1024 * 1024;
    public static final int MAX_HEADER = 256 * 1024;
    public static final int MAX_NAME = 48;
    public static final int MAX_CREDITS = 400;
    /** Largest file read (the web game's decoder default). */
    public static final int MAX_FILE_BYTES = 40 * 1024 * 1024;

    private static final int MAGIC = 0x4d50434d; // "MCPM" read little-endian
    private static final int VERSION = 1;
    private static final String[] MIMES = {"image/png", "image/jpeg", "image/webp"};

    private McpmFormat() {
    }

    /** Thrown for anything malformed; the message is short ("bad header", "bad index"...). */
    public static final class McpmException extends Exception {
        public McpmException(String message) {
            super(message);
        }
    }

    public static final class Material {
        /** RGBA 0-255, multiplied with the texture. */
        public final int[] color;
        /** Index into textures, or -1. */
        public final int texture;
        public final int alpha;

        Material(int[] color, int texture, int alpha) {
            this.color = color;
            this.texture = texture;
            this.alpha = alpha;
        }
    }

    public static final class Group {
        /** Range in indices (start, count) and its material. */
        public final int start;
        public final int count;
        public final int material;

        Group(int start, int count, int material) {
            this.start = start;
            this.count = count;
            this.material = material;
        }
    }

    public static final class Texture {
        public final String mime;
        public final byte[] bytes;

        Texture(String mime, byte[] bytes) {
            this.mime = mime;
            this.bytes = bytes;
        }
    }

    /** What the header says without the geometry (for model lists). */
    public static final class Info {
        public final String name;
        public final String credits;
        public final int vertexCount;
        public final int triangleCount;

        Info(String name, String credits, int vertexCount, int triangleCount) {
            this.name = name;
            this.credits = credits;
            this.vertexCount = vertexCount;
            this.triangleCount = triangleCount;
        }
    }

    /** A decoded model, in model space. */
    public static final class Data {
        public String name;
        public String credits;
        public float[] positions;
        /** Signed bytes, -127..127 per component. */
        public byte[] normals;
        public float[] uvs;
        /** Unsigned part indices (0..5), four per vertex. */
        public byte[] joints;
        /** Unsigned weights, four per vertex, summing to 255. */
        public byte[] weights;
        public int[] indices;
        public Group[] groups;
        public Material[] materials;
        public Texture[] textures;
        /** Pivot of each part (ModelBiped's rotation points on this body). */
        public float[][] pivots;
        /** Palm centres: right, left. */
        public float[][] hands;
        public float[] headCenter;
        public float headSize;
        public String rigSource;

        public int vertexCount() {
            return positions.length / 3;
        }
    }

    public static boolean isModelFile(byte[] bytes) {
        return bytes.length >= 12 && le32(bytes, 0) == MAGIC;
    }

    /** Removes control characters and the section sign, then trims to {@code max} characters. */
    public static String cleanText(String s, int max) {
        if (s == null) return "";
        StringBuilder b = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c <= 0x1f || c == 0x7f || c == '§') continue;
            b.append(c);
        }
        return b.length() > max ? b.substring(0, max) : b.toString();
    }

    /** Reads only the header (name, credits, counts): enough for a list of models. */
    public static Info readInfo(byte[] bytes) throws McpmException {
        JsonObject h = header(bytes);
        String name = cleanText(str(h.get("name")), MAX_NAME);
        int vc = integer(h.get("vertexCount"), 3, MAX_VERTICES, "vertex count");
        int ic = integer(h.get("indexCount"), 3, MAX_INDICES, "index count");
        return new Info(name.isEmpty() ? "Model" : name, cleanText(str(h.get("credits")), MAX_CREDITS), vc, ic / 3);
    }

    /**
     * Reads and checks a whole model file. Throws for wrong magic or version, counts over the
     * limits, ranges outside the file, indices past the vertices, joints that are not parts and
     * unknown image types.
     */
    public static Data decode(byte[] bytes) throws McpmException {
        if (bytes.length > MAX_FILE_BYTES) throw new McpmException("model too large");
        JsonObject h = header(bytes);
        int headerLen = le32(bytes, 8);
        int base = 12 + headerLen;
        int payload = bytes.length - base;
        int vc = integer(h.get("vertexCount"), 3, MAX_VERTICES, "vertex count");
        int ic = integer(h.get("indexCount"), 3, MAX_INDICES, "index count");
        if (ic % 3 != 0) throw new McpmException("bad index count");
        JsonElement wideEl = h.get("wideIndices");
        boolean wide = wideEl != null && wideEl.isJsonPrimitive() && wideEl.getAsJsonPrimitive().isBoolean() && wideEl.getAsBoolean();
        if (!wide && vc > 65536) throw new McpmException("bad index width");
        JsonArray boundsArr = array(h.get("bounds"));
        if (boundsArr == null || boundsArr.size() != 6) throw new McpmException("bad bounds");
        double[] bounds = new double[6];
        for (int i = 0; i < 6; i++) bounds[i] = number(boundsArr.get(i), -8, 8, "bounds");
        Layout lay = new Layout(vc, ic, wide);
        JsonObject g = object(h.get("geometry"));
        if (g == null) g = new JsonObject();
        int gOff = integer(g.get("offset"), 0, payload, "geometry");
        int gLen = integer(g.get("length"), 1, payload - gOff, "geometry");
        JsonElement size = g.get("size");
        if (!isNumber(size) || size.getAsDouble() != lay.end) throw new McpmException("bad geometry size");
        byte[] geo = boundedInflate(bytes, base + gOff, gLen, lay.end);
        ByteBuffer gv = ByteBuffer.wrap(geo).order(ByteOrder.LITTLE_ENDIAN);

        Data d = new Data();
        d.positions = new float[vc * 3];
        for (int i = 0; i < vc * 3; i++) {
            int k = i % 3;
            int q = gv.getShort(lay.positions + i * 2) & 0xffff;
            d.positions[i] = (float) (bounds[k] + (q / 65535.0) * (bounds[k + 3] - bounds[k]));
        }
        d.uvs = new float[vc * 2];
        for (int i = 0; i < vc * 2; i++) {
            float v = gv.getFloat(lay.uvs + i * 4);
            d.uvs[i] = !Float.isNaN(v) && !Float.isInfinite(v) && Math.abs(v) < 1e6f ? v : 0f;
        }
        d.normals = new byte[vc * 3];
        System.arraycopy(geo, lay.normals, d.normals, 0, vc * 3);
        d.joints = new byte[vc * 4];
        System.arraycopy(geo, lay.joints, d.joints, 0, vc * 4);
        d.weights = new byte[vc * 4];
        System.arraycopy(geo, lay.weights, d.weights, 0, vc * 4);
        for (byte j : d.joints) if ((j & 0xff) >= PART_COUNT) throw new McpmException("bad joint");
        d.indices = new int[ic];
        for (int i = 0; i < ic; i++) {
            long v = wide ? gv.getInt(lay.indices + i * 4) & 0xffffffffL : gv.getShort(lay.indices + i * 2) & 0xffff;
            if (v >= vc) throw new McpmException("bad index");
            d.indices[i] = (int) v;
        }

        JsonArray mats = array(h.get("materials"));
        if (mats == null || mats.size() < 1 || mats.size() > MAX_MATERIALS) throw new McpmException("bad materials");
        JsonArray texs = array(h.get("textures"));
        if (texs == null || texs.size() > MAX_TEXTURES) throw new McpmException("bad textures");
        d.textures = new Texture[texs.size()];
        for (int i = 0; i < texs.size(); i++) {
            JsonObject t = object(texs.get(i));
            String mime = t == null ? null : str(t.get("mime"));
            if (mime == null || !isKnownMime(mime) || !isString(t.get("mime"))) throw new McpmException("bad texture type");
            int off = integer(t.get("offset"), 0, payload, "texture");
            int len = integer(t.get("length"), 1, Math.min(MAX_TEXTURE_BYTES, payload - off), "texture");
            byte[] img = new byte[len];
            System.arraycopy(bytes, base + off, img, 0, len);
            d.textures[i] = new Texture(mime, img);
        }
        d.materials = new Material[mats.size()];
        for (int i = 0; i < mats.size(); i++) {
            JsonObject m = object(mats.get(i));
            JsonArray color = m == null ? null : array(m.get("color"));
            if (color == null || color.size() != 4) throw new McpmException("bad material");
            int[] c = new int[4];
            for (int k = 0; k < 4; k++) c[k] = integer(color.get(k), 0, 255, "colour");
            d.materials[i] = new Material(c, integer(m.get("texture"), -1, d.textures.length - 1, "material texture"), integer(m.get("alpha"), 0, 2, "alpha mode"));
        }
        JsonArray groups = array(h.get("groups"));
        if (groups == null || groups.size() < 1 || groups.size() > MAX_GROUPS) throw new McpmException("bad groups");
        d.groups = new Group[groups.size()];
        for (int i = 0; i < groups.size(); i++) {
            JsonObject gr = object(groups.get(i));
            int start = integer(gr == null ? null : gr.get("start"), 0, ic, "group");
            int count = integer(gr.get("count"), 0, ic - start, "group");
            if (start % 3 != 0 || count % 3 != 0) throw new McpmException("bad group");
            d.groups[i] = new Group(start, count, integer(gr.get("material"), 0, d.materials.length - 1, "group material"));
        }
        JsonObject r = object(h.get("rig"));
        if (r == null) r = new JsonObject();
        JsonArray pivots = array(r.get("pivots"));
        JsonArray hands = array(r.get("hands"));
        if (pivots == null || pivots.size() != PART_COUNT || hands == null || hands.size() != 2) throw new McpmException("bad rig");
        d.pivots = new float[PART_COUNT][];
        for (int k = 0; k < PART_COUNT; k++) d.pivots[k] = vec3(pivots.get(k), "pivot");
        d.hands = new float[][]{vec3(hands.get(0), "hand"), vec3(hands.get(1), "hand")};
        d.headCenter = vec3(r.get("headCenter"), "head");
        d.headSize = (float) number(r.get("headSize"), 0.01, 4, "head size");
        d.rigSource = "skeleton".equals(str(r.get("source"))) ? "skeleton" : "geometry";
        String name = cleanText(str(h.get("name")), MAX_NAME);
        d.name = name.isEmpty() ? "Model" : name;
        d.credits = cleanText(str(h.get("credits")), MAX_CREDITS);
        return d;
    }

    // ------------------------------------------------------------------ layout and inflate

    private static int align4(int n) {
        return (n + 3) & ~3;
    }

    /** Where each array sits in the inflated geometry block. */
    private static final class Layout {
        final int uvs;
        final int positions;
        final int normals;
        final int joints;
        final int weights;
        final int indices;
        final int end;

        Layout(int vc, int ic, boolean wide) {
            uvs = 0;
            positions = align4(uvs + vc * 8);
            normals = align4(positions + vc * 6);
            joints = align4(normals + vc * 3);
            weights = align4(joints + vc * 4);
            indices = align4(weights + vc * 4);
            end = indices + ic * (wide ? 4 : 2);
        }
    }

    /**
     * Inflates raw DEFLATE data (no zlib header: fflate's deflateSync), which must produce exactly
     * {@code size} bytes; stops as soon as it would produce more.
     */
    static byte[] boundedInflate(byte[] src, int off, int len, int size) throws McpmException {
        Inflater inf = new Inflater(true);
        try {
            // "nowrap" inflaters want one extra byte after the data (see Inflater's constructor).
            byte[] in = new byte[len + 1];
            System.arraycopy(src, off, in, 0, len);
            inf.setInput(in);
            byte[] out = new byte[size];
            int got = 0;
            while (got < size) {
                int n = inf.inflate(out, got, size - got);
                // Nothing more comes out: the stream ended, wants a dictionary or ran out of input.
                if (n == 0) break;
                got += n;
            }
            if (got != size) throw new McpmException("bad geometry data");
            if (!inf.finished()) {
                // More output than the header promised?
                byte[] extra = new byte[1];
                if (inf.inflate(extra) > 0) throw new McpmException("bad geometry data");
            }
            return out;
        } catch (DataFormatException e) {
            throw new McpmException("bad geometry data");
        } finally {
            inf.end();
        }
    }

    // ------------------------------------------------------------------ header and JSON checks

    private static JsonObject header(byte[] bytes) throws McpmException {
        if (!isModelFile(bytes)) throw new McpmException("not a model file");
        if (le32(bytes, 4) != VERSION) throw new McpmException("unsupported model version");
        long headerLen = le32(bytes, 8) & 0xffffffffL;
        if (headerLen > MAX_HEADER || 12 + headerLen > bytes.length) throw new McpmException("bad header");
        String text;
        try {
            text = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes, 12, (int) headerLen))
                    .toString();
        } catch (CharacterCodingException e) {
            throw new McpmException("bad header");
        }
        JsonElement root;
        try {
            JsonReader reader = new JsonReader(new StringReader(text));
            reader.setLenient(false);
            root = Streams.parse(reader);
            if (reader.peek() != JsonToken.END_DOCUMENT) throw new McpmException("bad header");
        } catch (McpmException e) {
            throw e;
        } catch (Exception e) {
            throw new McpmException("bad header");
        }
        // Like the web decoder (typeof h === 'object'): an array passes here and fails on its fields.
        if (root != null && root.isJsonArray()) return new JsonObject();
        if (root == null || !root.isJsonObject()) throw new McpmException("bad header");
        return root.getAsJsonObject();
    }

    private static int le32(byte[] b, int o) {
        return (b[o] & 0xff) | (b[o + 1] & 0xff) << 8 | (b[o + 2] & 0xff) << 16 | (b[o + 3] & 0xff) << 24;
    }

    private static boolean isKnownMime(String mime) {
        for (String m : MIMES) if (m.equals(mime)) return true;
        return false;
    }

    private static boolean isNumber(JsonElement e) {
        return e != null && e.isJsonPrimitive() && ((JsonPrimitive) e).isNumber();
    }

    private static boolean isString(JsonElement e) {
        return e != null && e.isJsonPrimitive() && ((JsonPrimitive) e).isString();
    }

    private static String str(JsonElement e) {
        if (e == null || e.isJsonNull()) return "";
        if (e.isJsonPrimitive()) return e.getAsString();
        return "";
    }

    private static JsonArray array(JsonElement e) {
        return e != null && e.isJsonArray() ? e.getAsJsonArray() : null;
    }

    private static JsonObject object(JsonElement e) {
        return e != null && e.isJsonObject() ? e.getAsJsonObject() : null;
    }

    /** An integer in [min, max] (JSON numbers like 3.0 count, as Number.isInteger does). */
    private static int integer(JsonElement e, long min, long max, String what) throws McpmException {
        if (!isNumber(e)) throw new McpmException("bad " + what);
        double v = e.getAsDouble();
        if (Double.isNaN(v) || Double.isInfinite(v) || v != Math.floor(v) || v < min || v > max) throw new McpmException("bad " + what);
        return (int) v;
    }

    private static double number(JsonElement e, double min, double max, String what) throws McpmException {
        if (!isNumber(e)) throw new McpmException("bad " + what);
        double v = e.getAsDouble();
        if (Double.isNaN(v) || Double.isInfinite(v) || v < min || v > max) throw new McpmException("bad " + what);
        return v;
    }

    private static float[] vec3(JsonElement e, String what) throws McpmException {
        JsonArray a = array(e);
        if (a == null || a.size() != 3) throw new McpmException("bad " + what);
        return new float[]{(float) number(a.get(0), -4, 4, what), (float) number(a.get(1), -4, 4, what), (float) number(a.get(2), -4, 4, what)};
    }
}
