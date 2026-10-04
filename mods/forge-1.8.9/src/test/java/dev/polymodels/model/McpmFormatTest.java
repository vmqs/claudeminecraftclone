package dev.polymodels.model;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.BeforeClass;
import org.junit.Test;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.fail;

/**
 * The Java .mcpm decoder against the web game's own decoder (PlayerModelFormat.ts): the fixture
 * src/test/resources/mcpm-reference.json is written by scripts/mcpm-reference.mjs from the
 * repository and holds exact hashes of every decoded array of the built-in models, and damaged
 * files with the error the web game reports. The Java decoder must give the same arrays bit for
 * bit and refuse the same files with the same messages.
 */
public class McpmFormatTest {
    private static JsonObject fixture;

    @BeforeClass
    public static void load() throws IOException {
        try (InputStream in = McpmFormatTest.class.getResourceAsStream("/mcpm-reference.json")) {
            fixture = new JsonParser().parse(new InputStreamReader(in, StandardCharsets.UTF_8)).getAsJsonObject();
        }
    }

    private static byte[] resource(String path) throws IOException {
        try (InputStream in = McpmFormatTest.class.getResourceAsStream(path)) {
            if (in == null) throw new IOException("missing " + path + " (run the build: copyBuiltinModels)");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }

    /** FNV-1a (32 bit), as the fixture computes it. */
    static long fnv(byte[] bytes) {
        int h = 0x811c9dc5;
        for (byte b : bytes) {
            h ^= b & 0xff;
            h *= 0x01000193;
        }
        return h & 0xffffffffL;
    }

    static long fnv(float[] values) {
        ByteBuffer b = ByteBuffer.allocate(values.length * 4).order(ByteOrder.LITTLE_ENDIAN);
        for (float v : values) b.putInt(Float.floatToRawIntBits(v));
        return fnv(b.array());
    }

    static long fnv(int[] values) {
        ByteBuffer b = ByteBuffer.allocate(values.length * 4).order(ByteOrder.LITTLE_ENDIAN);
        for (int v : values) b.putInt(v);
        return fnv(b.array());
    }

    private static float[] floats(JsonElement e) {
        JsonArray a = e.getAsJsonArray();
        float[] out = new float[a.size()];
        for (int i = 0; i < out.length; i++) out[i] = a.get(i).getAsFloat();
        return out;
    }

    @Test
    public void builtInModelsDecodeLikeTheWebGame() throws Exception {
        JsonArray models = fixture.getAsJsonArray("models");
        assertEquals(3, models.size());
        for (JsonElement el : models) {
            JsonObject m = el.getAsJsonObject();
            String id = m.get("id").getAsString();
            byte[] bytes = resource("/assets/polymodels/models/" + id + ".mcpm");
            McpmFormat.Data d = McpmFormat.decode(bytes);
            assertEquals(id + " name", m.get("name").getAsString(), d.name);
            assertEquals(id + " credits", m.get("credits").getAsString(), d.credits);
            assertEquals(id + " vertices", m.get("vertexCount").getAsInt(), d.vertexCount());
            assertEquals(id + " indices", m.get("indexCount").getAsInt(), d.indices.length);
            assertArrayEquals(id + " first positions", floats(m.get("firstPositions")), java.util.Arrays.copyOf(d.positions, 9), 0f);
            assertEquals(id + " positions", m.get("positions").getAsLong(), fnv(d.positions));
            assertEquals(id + " uvs", m.get("uvs").getAsLong(), fnv(d.uvs));
            assertEquals(id + " normals", m.get("normals").getAsLong(), fnv(d.normals));
            assertEquals(id + " joints", m.get("joints").getAsLong(), fnv(d.joints));
            assertEquals(id + " weights", m.get("weights").getAsLong(), fnv(d.weights));
            assertEquals(id + " index values", m.get("indices").getAsLong(), fnv(d.indices));
            JsonArray groups = m.getAsJsonArray("groups");
            assertEquals(groups.size(), d.groups.length);
            for (int i = 0; i < groups.size(); i++) {
                JsonObject g = groups.get(i).getAsJsonObject();
                assertEquals(g.get("start").getAsInt(), d.groups[i].start);
                assertEquals(g.get("count").getAsInt(), d.groups[i].count);
                assertEquals(g.get("material").getAsInt(), d.groups[i].material);
            }
            JsonArray mats = m.getAsJsonArray("materials");
            assertEquals(mats.size(), d.materials.length);
            for (int i = 0; i < mats.size(); i++) {
                JsonObject mat = mats.get(i).getAsJsonObject();
                for (int k = 0; k < 4; k++) assertEquals(mat.getAsJsonArray("color").get(k).getAsInt(), d.materials[i].color[k]);
                assertEquals(mat.get("texture").getAsInt(), d.materials[i].texture);
                assertEquals(mat.get("alpha").getAsInt(), d.materials[i].alpha);
            }
            JsonArray texs = m.getAsJsonArray("textures");
            assertEquals(texs.size(), d.textures.length);
            for (int i = 0; i < texs.size(); i++) {
                JsonObject t = texs.get(i).getAsJsonObject();
                assertEquals(t.get("mime").getAsString(), d.textures[i].mime);
                assertEquals(t.get("length").getAsInt(), d.textures[i].bytes.length);
                assertEquals(t.get("hash").getAsLong(), fnv(d.textures[i].bytes));
            }
            JsonObject rig = m.getAsJsonObject("rig");
            for (int k = 0; k < McpmFormat.PART_COUNT; k++) assertArrayEquals(floats(rig.getAsJsonArray("pivots").get(k)), d.pivots[k], 0f);
            for (int k = 0; k < 2; k++) assertArrayEquals(floats(rig.getAsJsonArray("hands").get(k)), d.hands[k], 0f);
            assertArrayEquals(floats(rig.get("headCenter")), d.headCenter, 0f);
            assertEquals(rig.get("headSize").getAsFloat(), d.headSize, 0f);
            assertEquals(rig.get("source").getAsString(), d.rigSource);
            McpmFormat.Info info = McpmFormat.readInfo(bytes);
            assertEquals(d.name, info.name);
            assertEquals(d.indices.length / 3, info.triangleCount);
        }
    }

    @Test
    public void damagedFilesAreRefusedLikeTheWebGame() {
        JsonArray cases = fixture.getAsJsonArray("cases");
        int refused = 0;
        for (JsonElement el : cases) {
            JsonObject c = el.getAsJsonObject();
            String name = c.get("name").getAsString();
            byte[] bytes = caseBytes(c);
            JsonElement error = c.get("error");
            McpmFormat.Data d = null;
            String message = null;
            try {
                d = McpmFormat.decode(bytes);
            } catch (McpmFormat.McpmException e) {
                message = e.getMessage();
            } catch (Throwable t) {
                fail(name + ": threw " + t);
            }
            if (error.isJsonNull()) {
                assertNull(name + ": refused", message);
                assertEquals(name, c.get("vertexCount").getAsInt(), d.vertexCount());
                assertEquals(name, c.get("indices").getAsLong(), fnv(d.indices));
                assertEquals(name, c.get("positions").getAsLong(), fnv(d.positions));
                assertEquals(name, c.get("modelName").getAsString(), d.name);
                assertEquals(name, c.get("credits").getAsString(), d.credits);
                try {
                    McpmFormat.Info info = McpmFormat.readInfo(bytes);
                    assertEquals(name, d.name, info.name);
                    assertEquals(name, d.credits, info.credits);
                } catch (Throwable t) {
                    fail(name + ": readInfo threw " + t);
                }
            } else {
                assertEquals(name, error.getAsString(), message);
                refused++;
            }
        }
        assertEquals(43, refused);
    }

    /** A case's file: base64, raw-deflated first when the fixture says so (the deep header). */
    static byte[] caseBytes(JsonObject c) {
        byte[] bytes = Base64.getDecoder().decode(c.get("base64").getAsString());
        if (!c.has("deflated")) return bytes;
        java.util.zip.Inflater inf = new java.util.zip.Inflater(true);
        try {
            inf.setInput(java.util.Arrays.copyOf(bytes, bytes.length + 1));
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            while (!inf.finished()) {
                int n = inf.inflate(buf);
                if (n == 0 && (inf.needsInput() || inf.needsDictionary())) throw new IllegalStateException("bad fixture data");
                out.write(buf, 0, n);
            }
            return out.toByteArray();
        } catch (java.util.zip.DataFormatException e) {
            throw new IllegalStateException(e);
        } finally {
            inf.end();
        }
    }

    /** The case named in the fixture. */
    static byte[] caseBytes(String name) {
        for (JsonElement el : fixture.getAsJsonArray("cases")) {
            if (el.getAsJsonObject().get("name").getAsString().equals(name)) return caseBytes(el.getAsJsonObject());
        }
        throw new IllegalArgumentException("no fixture case " + name);
    }

    /** JavaScript's Number.prototype.toString, which the web game's String(name) uses. */
    @Test
    public void numbersPrintAsInJavaScript() {
        String[][] cases = {
                {"0", "0"}, {"-0", "0"}, {"1", "1"}, {"-1", "-1"}, {"12.5", "12.5"}, {"0.1", "0.1"},
                {"100", "100"}, {"1e21", "1e+21"}, {"1.5e21", "1.5e+21"}, {"1e20", "100000000000000000000"},
                {"123456789012345680000", "123456789012345680000"}, {"0.000001", "0.000001"},
                {"0.0000001", "1e-7"}, {"1.25e-7", "1.25e-7"}, {"-0.000123", "-0.000123"},
                {"5e-324", "5e-324"}, {"1.7976931348623157e308", "1.7976931348623157e+308"},
                {"0.30000000000000004", "0.30000000000000004"}, {"4.35", "4.35"}, {"1e-6", "0.000001"},
                {"2e-323", "2e-323"}, {"1e23", "1e+23"}, {"9007199254740993", "9007199254740992"}, {"0.1e1", "1"},
                {"2.2250738585072014e-308", "2.2250738585072014e-308"}, {"123.456", "123.456"},
        };
        for (String[] c : cases) assertEquals(c[0], c[1], McpmFormat.jsNumber(Double.parseDouble(c[0])));
        // Random doubles of every magnitude, printed by the web game's String().
        JsonArray numbers = fixture.getAsJsonArray("numbers");
        assertEquals(600, numbers.size());
        for (JsonElement el : numbers) {
            double v = Double.longBitsToDouble(Long.parseUnsignedLong(el.getAsJsonArray().get(0).getAsString(), 16));
            assertEquals(el.getAsJsonArray().get(0).getAsString(), el.getAsJsonArray().get(1).getAsString(), McpmFormat.jsNumber(v));
        }
    }

    @Test
    public void truncatedFilesNeverReadPastTheEnd() throws Exception {
        byte[] bytes = resource("/assets/polymodels/models/roblox_noob.mcpm");
        for (int len = 0; len < bytes.length; len += 97) {
            try {
                McpmFormat.decode(java.util.Arrays.copyOf(bytes, len));
                fail("a truncated file (" + len + " bytes) decoded");
            } catch (McpmFormat.McpmException expected) {
                // Refused with a message, never an exception from reading past the end.
            }
        }
    }
}
