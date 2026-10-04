package dev.polymodels.model;

import net.minecraftforge.fml.relauncher.FMLInjectionData;
import net.minecraftforge.fml.relauncher.FMLRelaunchLog;
import net.minecraftforge.fml.relauncher.Side;
import org.junit.BeforeClass;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.File;
import java.io.IOException;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * config/polymodels.cfg as a player would write it by hand, read through Forge's own
 * Configuration (which renames a file it cannot parse to *.errored and starts over, losing every
 * choice): the documented examples must load, and version 1.0.0's quoted "*" entry moves to
 * general -> others.
 */
public class ModelRegistryConfigTest {
    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    @BeforeClass
    public static void minecraftHome() throws ReflectiveOperationException {
        // Configuration's constructor reads the game directory from FMLInjectionData.
        Field f = FMLInjectionData.class.getDeclaredField("minecraftHome");
        f.setAccessible(true);
        if (f.get(null) == null) f.set(null, new File(".").getAbsoluteFile());
        // FMLLog (Configuration reports a broken file through it) needs the side to log.
        Field side = FMLRelaunchLog.class.getDeclaredField("side");
        side.setAccessible(true);
        if (side.get(null) == null) side.set(null, Side.CLIENT);
    }

    private ModelRegistry load(File configDir, String cfg) throws IOException {
        if (cfg != null) Files.write(new File(configDir, "polymodels.cfg").toPath(), cfg.getBytes(StandardCharsets.UTF_8));
        ModelRegistry r = new ModelRegistry();
        r.init(configDir);
        return r;
    }

    private static void assertNotErrored(File dir) {
        String[] names = dir.list();
        for (String n : names) assertFalse("Forge refused the file: " + n, n.endsWith(".errored"));
    }

    private static String text(File f) throws IOException {
        return new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8);
    }

    /** The README's example, typed by hand. */
    @Test
    public void readmeExampleLoads() throws IOException {
        File dir = tmp.newFolder("config");
        ModelRegistry r = load(dir, "general {\n"
                + "    S:model=john_marston\n"
                + "    S:others=roblox_noob\n"
                + "}\n\n"
                + "players {\n"
                + "    S:Notch=trevor\n"
                + "    S:jeb_=steve\n"
                + "}\n");
        assertNotErrored(dir);
        assertEquals("john_marston", r.local());
        assertEquals("roblox_noob", r.others());
        assertEquals("trevor", r.idForOther("Notch"));
        assertEquals("trevor", r.idForOther("notch"));
        assertEquals("steve", r.idForOther("jeb_"));
        assertEquals("roblox_noob", r.idForOther("Someone"));
        // The built-in models are listed from the jar's resources.
        assertTrue(r.find("john_marston") != null && r.find("trevor") != null && r.find("roblox_noob") != null);
    }

    /** A new file gets both general keys, with everyone else as Steve. */
    @Test
    public void defaults() throws IOException {
        File dir = tmp.newFolder("config");
        ModelRegistry r = load(dir, null);
        assertEquals(ModelRegistry.STEVE, r.local());
        assertEquals(ModelRegistry.STEVE, r.others());
        assertEquals(ModelRegistry.STEVE, r.idForOther("Notch"));
        String saved = text(new File(dir, "polymodels.cfg"));
        assertTrue(saved, saved.contains("S:model=steve"));
        assertTrue(saved, saved.contains("S:others=steve"));
        assertTrue(new File(dir, "polymodels/README.txt").isFile());
    }

    /** What the mod writes, it reads back (and Forge accepts). */
    @Test
    public void roundTrip() throws IOException {
        File dir = tmp.newFolder("config");
        ModelRegistry r = load(dir, null);
        r.setLocal("trevor");
        r.setOthers("john_marston");
        r.setPlayer("Notch", "roblox_noob");
        ModelRegistry again = load(dir, null);
        assertNotErrored(dir);
        assertEquals("trevor", again.local());
        assertEquals("john_marston", again.others());
        assertEquals("roblox_noob", again.idForOther("Notch"));
        assertEquals("john_marston", again.idForOther("Dinnerbone"));
        again.setPlayer("Notch", null);
        assertEquals("john_marston", load(dir, null).idForOther("Notch"));
    }

    /** Version 1.0.0's S:"*"=id (the only spelling Forge accepts) becomes general -> others. */
    @Test
    public void quotedStarMigrates() throws IOException {
        File dir = tmp.newFolder("config");
        ModelRegistry r = load(dir, "general {\n    S:model=trevor\n}\n\nplayers {\n    S:\"*\"=roblox_noob\n    S:Notch=john_marston\n}\n");
        assertNotErrored(dir);
        assertEquals("trevor", r.local());
        assertEquals("roblox_noob", r.others());
        assertEquals("roblox_noob", r.idForOther("Someone"));
        assertEquals("john_marston", r.idForOther("Notch"));
        String saved = text(new File(dir, "polymodels.cfg"));
        assertFalse(saved, saved.contains("\"*\""));
        assertTrue(saved, saved.contains("S:others=roblox_noob"));
    }

    /**
     * The unquoted S:*=id that version 1.0.0's README showed is a syntax error for Forge: the file
     * is renamed and a fresh one written. Documented here so nobody brings that example back.
     */
    @Test
    public void unquotedStarIsRefusedByForge() throws IOException {
        File dir = tmp.newFolder("config");
        ModelRegistry r = load(dir, "general {\n    S:model=trevor\n}\n\nplayers {\n    S:*=roblox_noob\n}\n");
        String[] names = dir.list();
        boolean errored = false;
        for (String n : names) errored |= n.endsWith(".errored");
        assertTrue("Forge accepted S:*= (update the README if it does now)", errored);
        assertEquals(ModelRegistry.STEVE, r.local());
    }

    /**
     * Folder files never stop the listing (or the game's start): a header nested 120,000 levels
     * deep (a StackOverflowError in Gson's recursive parser before), garbage and an empty file.
     */
    @Test
    public void hostileFolderFilesAreListed() throws Exception {
        File dir = tmp.newFolder("config");
        File models = new File(dir, "polymodels");
        assertTrue(models.mkdirs());
        McpmFormatTest.load();
        Files.write(new File(models, "deep.mcpm").toPath(), McpmFormatTest.caseBytes("header nested 120,000 levels deep"));
        Files.write(new File(models, "garbage.mcpm").toPath(), "not a model at all".getBytes(StandardCharsets.UTF_8));
        Files.write(new File(models, "empty.mcpm").toPath(), new byte[0]);
        ModelRegistry r = load(dir, null);
        assertEquals("Tiny", r.find("deep").name);
        assertEquals(ModelRegistry.State.UNLOADED, r.find("deep").state());
        assertEquals(ModelRegistry.State.FAILED, r.find("garbage").state());
        assertEquals("not a model file", r.find("garbage").error());
        assertEquals(ModelRegistry.State.FAILED, r.find("empty").state());
        assertEquals("unreadable file", r.find("empty").error());
        assertTrue(r.find("john_marston") != null);
    }

    /** Every name Minecraft allows (letters, digits, underscore) works unquoted. */
    @Test
    public void playerNamesNeedNoQuotes() throws IOException {
        File dir = tmp.newFolder("config");
        ModelRegistry r = load(dir, "players {\n    S:A_b9=trevor\n    S:_under=roblox_noob\n    S:x=john_marston\n}\n");
        assertNotErrored(dir);
        assertEquals("trevor", r.idForOther("a_B9"));
        assertEquals("roblox_noob", r.idForOther("_under"));
        assertEquals("john_marston", r.idForOther("X"));
        List<String> lines = Files.readAllLines(new File(dir, "polymodels.cfg").toPath(), StandardCharsets.UTF_8);
        for (String l : lines) assertFalse(l, l.trim().startsWith("S:\""));
    }
}
