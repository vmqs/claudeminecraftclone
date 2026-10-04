package dev.polymodels.model;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.minecraft.client.Minecraft;
import net.minecraft.entity.player.EntityPlayer;
import net.minecraftforge.common.config.ConfigCategory;
import net.minecraftforge.common.config.Configuration;
import net.minecraftforge.common.config.Property;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The models players can wear: the built-in ones inside the jar (the web game's three), and every
 * .mcpm file in config/polymodels/. Files are decoded on a background thread the first time a
 * model is needed. The local player's choice lives in config/polymodels.cfg ("general" → "model");
 * the "players" section names models for other players by name and "general" → "others" the model
 * of everyone not listed (seen by you only).
 */
public final class ModelRegistry {
    private static final Logger LOG = LogManager.getLogger("PolyModels");
    public static final String STEVE = "steve";
    private static final String BUILTIN_DIR = "/assets/polymodels/models/";

    public enum State { UNLOADED, LOADING, READY, FAILED }

    public static final class Entry {
        public final String id;
        public final String name;
        public final String credits;
        public final boolean builtin;
        public final int triangles;
        final File file;
        volatile State state = State.UNLOADED;
        volatile PolyModel model;
        volatile String error = "";

        Entry(String id, String name, String credits, boolean builtin, int triangles, File file) {
            this.id = id;
            this.name = name;
            this.credits = credits;
            this.builtin = builtin;
            this.triangles = triangles;
            this.file = file;
        }

        public State state() {
            return state;
        }

        public String error() {
            return error;
        }

        public PolyModel model() {
            return model;
        }
    }

    private volatile List<Entry> entries = Collections.emptyList();
    private final ExecutorService loader = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "Poly Player Models loader");
        t.setDaemon(true);
        t.setPriority(Thread.MIN_PRIORITY + 1);
        return t;
    });
    private File folder;
    private Configuration config;
    private Property localProp;
    private Property othersProp;
    private final Map<String, String> players = new HashMap<>();
    private List<Entry> builtins = Collections.emptyList();

    /** Reads the config, creates the folder (with its README) and lists the models. */
    public void init(File configDir) {
        folder = new File(configDir, "polymodels");
        if (!folder.isDirectory() && !folder.mkdirs()) LOG.warn("Could not create {}", folder);
        File readme = new File(folder, "README.txt");
        if (!readme.exists()) {
            try {
                Files.write(readme.toPath(), README.getBytes(StandardCharsets.UTF_8));
            } catch (IOException e) {
                LOG.warn("Could not write {}", readme, e);
            }
        }
        config = new Configuration(new File(configDir, "polymodels.cfg"));
        config.load();
        localProp = config.get(Configuration.CATEGORY_GENERAL, "model", STEVE,
                "The model you wear: steve (vanilla), a built-in model (john_marston, trevor, roblox_noob)\n"
                        + "or the name of a .mcpm file in config/polymodels without .mcpm. Set in game with the\n"
                        + "\"Choose Player Model\" key (M by default).");
        othersProp = config.get(Configuration.CATEGORY_GENERAL, "others", STEVE,
                "The model every other player wears on your screen unless the \"players\" section names one\n"
                        + "for them (steve: their normal skin). Seen by you only: the mod is client-side.");
        ConfigCategory cat = config.getCategory("players");
        cat.setComment("Models for other players by name, seen by you only (the mod is client-side; other players\n"
                + "see their own normal skins). One line per player: S:<player name>=<model id>, e.g.\n"
                + "    S:Notch=trevor\n"
                + "Everyone not listed wears general -> others.");
        // Version 1.0.0's documentation suggested a "*" entry here (Forge only reads it quoted, as
        // S:"*"=id): move it to general -> others.
        Property star = cat.get("*");
        if (star != null) {
            String v = star.getString().trim();
            if (STEVE.equalsIgnoreCase(othersProp.getString().trim()) && !v.isEmpty()) othersProp.set(v);
            cat.remove("*");
        }
        readPlayers();
        if (config.hasChanged()) config.save();
        builtins = readBuiltins();
        rescan();
    }

    private void readPlayers() {
        players.clear();
        for (Map.Entry<String, Property> e : config.getCategory("players").entrySet()) {
            players.put(e.getKey().toLowerCase(Locale.ROOT), e.getValue().getString().trim());
        }
    }

    /** The built-in models listed in the jar's index.json (generated from the web game's). */
    private List<Entry> readBuiltins() {
        List<Entry> out = new ArrayList<>();
        try (InputStream in = ModelRegistry.class.getResourceAsStream(BUILTIN_DIR + "index.json")) {
            if (in == null) {
                LOG.warn("No built-in models in the jar");
                return out;
            }
            Reader reader = new InputStreamReader(in, StandardCharsets.UTF_8);
            JsonArray models = new JsonParser().parse(reader).getAsJsonObject().getAsJsonArray("models");
            for (JsonElement el : models) {
                JsonObject m = el.getAsJsonObject();
                String id = m.get("id").getAsString();
                if (!id.matches("[a-z0-9_]{1,32}")) continue;
                McpmFormat.Info info;
                try (InputStream file = ModelRegistry.class.getResourceAsStream(BUILTIN_DIR + id + ".mcpm")) {
                    if (file == null) continue;
                    info = McpmFormat.readInfo(readPrefix(file));
                } catch (Exception | StackOverflowError ex) {
                    LOG.warn("Built-in model {} is damaged", id, ex);
                    continue;
                }
                String credits = m.has("credits") ? McpmFormat.cleanText(m.get("credits").getAsString(), McpmFormat.MAX_CREDITS) : info.credits;
                out.add(new Entry(id, info.name, credits, true, info.triangleCount, null));
            }
        } catch (Exception e) {
            LOG.error("Could not read the built-in model list", e);
        }
        return out;
    }

    /** Lists the folder's .mcpm files again (built-ins stay as they are). */
    public void rescan() {
        List<Entry> list = new ArrayList<>(builtins);
        File[] files = folder == null ? null : folder.listFiles((dir, n) -> n.toLowerCase(Locale.ROOT).endsWith(".mcpm"));
        if (files != null) {
            Arrays.sort(files, (a, b) -> a.getName().compareToIgnoreCase(b.getName()));
            for (File f : files) {
                String id = f.getName().substring(0, f.getName().length() - 5);
                if (find(list, id) != null) {
                    LOG.warn("{}: a model named {} already exists; rename the file", f.getName(), id);
                    continue;
                }
                Entry e;
                try {
                    McpmFormat.Info info = McpmFormat.readInfo(readPrefix(f));
                    e = new Entry(id, info.name, info.credits, false, info.triangleCount, f);
                } catch (Throwable ex) {
                    // Nothing in one file may stop the game starting or the list loading.
                    e = new Entry(id, id, "", false, -1, f);
                    e.state = State.FAILED;
                    e.error = ex instanceof McpmFormat.McpmException ? ex.getMessage() : "unreadable file";
                    if (ex instanceof McpmFormat.McpmException) LOG.warn("{} is not a usable model: {}", f.getName(), e.error);
                    else LOG.warn("{} is not a usable model", f.getName(), ex);
                }
                list.add(e);
            }
        }
        entries = Collections.unmodifiableList(list);
        LOG.info("{} models ({} built in, {} in {})", list.size(), builtins.size(), list.size() - builtins.size(), folder);
    }

    /**
     * Forgets the folder models (their GL textures are freed: call on the render thread) and lists
     * the folder again; models are decoded again when next needed.
     */
    public void reloadFolder() {
        for (Entry e : entries) {
            if (e.builtin) continue;
            PolyModel m = e.model;
            e.model = null;
            e.state = State.FAILED;
            if (m != null) m.dispose();
        }
        rescan();
    }

    /** Header bytes only (enough for name and counts). */
    private static byte[] readPrefix(File f) throws IOException {
        try (InputStream in = new FileInputStream(f)) {
            return readPrefix(in);
        }
    }

    private static byte[] readPrefix(InputStream stream) throws IOException {
        DataInputStream in = new DataInputStream(stream);
        byte[] head = new byte[12];
        in.readFully(head);
        int len = (head[8] & 0xff) | (head[9] & 0xff) << 8 | (head[10] & 0xff) << 16 | (head[11] & 0xff) << 24;
        // A bad length is reported by readInfo ("bad header").
        if (len < 0 || len > McpmFormat.MAX_HEADER) return head;
        byte[] out = new byte[12 + len];
        System.arraycopy(head, 0, out, 0, 12);
        in.readFully(out, 12, len);
        return out;
    }

    public File folder() {
        return folder;
    }

    public List<Entry> list() {
        return entries;
    }

    public Entry find(String id) {
        return find(entries, id);
    }

    private static Entry find(List<Entry> list, String id) {
        if (id == null) return null;
        for (Entry e : list) if (e.id.equalsIgnoreCase(id)) return e;
        return null;
    }

    public String local() {
        return localProp.getString();
    }

    /** Wears a model (steve or an id) and saves the choice. */
    public void setLocal(String id) {
        localProp.set(id == null ? STEVE : id);
        config.save();
        if (!STEVE.equals(id)) request(find(id));
    }

    /** Sets (or with null removes) another player's model and saves it. */
    public void setPlayer(String name, String id) {
        ConfigCategory cat = config.getCategory("players");
        if (id == null) cat.remove(name);
        else config.get("players", name, id).set(id);
        config.save();
        readPlayers();
    }

    /** The model every player not named in "players" wears (general -> others). */
    public String others() {
        String v = othersProp.getString().trim();
        return v.isEmpty() ? STEVE : v;
    }

    /** Sets general -> others and saves it. */
    public void setOthers(String id) {
        othersProp.set(id == null || id.trim().isEmpty() ? STEVE : id.trim());
        config.save();
    }

    /** The model id a player wears as far as this client is concerned. */
    public String idFor(EntityPlayer p) {
        if (p == Minecraft.getMinecraft().thePlayer) return local();
        return idForOther(p.getName());
    }

    /** The model id of another player by name: their "players" entry, else general -> others. */
    public String idForOther(String name) {
        String id = players.get(name.toLowerCase(Locale.ROOT));
        return id != null && !id.isEmpty() ? id : others();
    }

    /** The decoded model a player wears, or null for Steve (or while it loads, or when it failed). */
    public PolyModel modelFor(EntityPlayer p) {
        return ready(idFor(p));
    }

    /** The decoded model for an id, starting the load when needed (null until ready). */
    public PolyModel ready(String id) {
        if (id == null || STEVE.equalsIgnoreCase(id)) return null;
        Entry e = find(id);
        if (e == null) return null;
        if (e.state == State.READY) return e.model;
        request(e);
        return null;
    }

    /** Starts decoding a model on the loader thread (once). */
    public synchronized void request(Entry e) {
        if (e == null || e.state != State.UNLOADED) return;
        e.state = State.LOADING;
        loader.submit(() -> load(e));
    }

    private void load(Entry e) {
        long t0 = System.nanoTime();
        try {
            byte[] bytes = e.builtin ? readResource(BUILTIN_DIR + e.id + ".mcpm") : readFile(e.file);
            PolyModel m = PolyModel.decode(e.id, bytes);
            e.model = m;
            e.state = State.READY;
            LOG.info("Loaded model {} ({}, {} triangles) in {} ms", e.id, m.name, m.triangles, (System.nanoTime() - t0) / 1_000_000);
        } catch (McpmFormat.McpmException ex) {
            e.error = ex.getMessage();
            e.state = State.FAILED;
            LOG.warn("Model {} is damaged: {}", e.id, ex.getMessage());
        } catch (Throwable ex) {
            e.error = "could not be read";
            e.state = State.FAILED;
            LOG.warn("Model {} could not be loaded", e.id, ex);
        }
    }

    private static byte[] readResource(String path) throws IOException {
        try (InputStream in = ModelRegistry.class.getResourceAsStream(path)) {
            if (in == null) throw new IOException("missing " + path);
            return readLimited(in);
        }
    }

    private static byte[] readFile(File f) throws IOException {
        if (f.length() > McpmFormat.MAX_FILE_BYTES) throw new IOException(f.getName() + " is larger than 40 MB");
        try (InputStream in = new FileInputStream(f)) {
            return readLimited(in);
        }
    }

    private static byte[] readLimited(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream(1 << 20);
        byte[] buf = new byte[65536];
        int n;
        while ((n = in.read(buf)) > 0) {
            out.write(buf, 0, n);
            if (out.size() > McpmFormat.MAX_FILE_BYTES) throw new IOException("model file larger than 40 MB");
        }
        return out.toByteArray();
    }

    private static final String README = String.join(System.lineSeparator(),
            "Poly Player Models: custom models",
            "==================================",
            "",
            "Put player model files (.mcpm) in this folder, then press \"Reload folder\" in the",
            "Choose Player Model screen (M in game) or restart Minecraft.",
            "",
            "Where to get .mcpm files: the Minecraft 1.5.2 browser game this mod comes from.",
            "  1. Open its Account Manager (title screen or Options).",
            "  2. Choose a model with the Model button, or Import Model... your own",
            "     (.glb, .gltf, .fbx, .obj or a .zip with one; it is scaled to 1.8 blocks and",
            "     rigged onto the six parts of the player automatically).",
            "  3. Press \"Export .mcpm\" and save the file here.",
            "",
            "The file name (without .mcpm) is the model's id, used in config/polymodels.cfg.",
            "Other players see your normal skin unless they have this mod and name your model",
            "for you in config/polymodels.cfg (by name in \"players\", or everyone with \"others\").",
            "");
}
