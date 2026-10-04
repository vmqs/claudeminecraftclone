package dev.polymodels.dev;

import com.mojang.authlib.GameProfile;
import dev.polymodels.PolyModelsMod;
import dev.polymodels.gui.GuiChooseModel;
import dev.polymodels.model.ModelRegistry;
import dev.polymodels.model.PolyModel;
import net.minecraft.client.Minecraft;
import net.minecraft.client.entity.EntityOtherPlayerMP;
import net.minecraft.client.gui.GuiMainMenu;
import net.minecraft.client.gui.inventory.GuiInventory;
import net.minecraft.client.settings.KeyBinding;
import net.minecraft.entity.player.EntityPlayerMP;
import net.minecraft.init.Blocks;
import net.minecraft.init.Items;
import net.minecraft.item.ItemStack;
import net.minecraft.server.integrated.IntegratedServer;
import net.minecraft.util.ScreenShotHelper;
import net.minecraft.world.EnumDifficulty;
import net.minecraft.world.WorldServer;
import net.minecraft.world.WorldSettings;
import net.minecraft.world.WorldType;
import net.minecraftforge.fml.common.eventhandler.SubscribeEvent;
import net.minecraftforge.fml.common.gameevent.TickEvent;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.function.BooleanSupplier;
import java.util.function.IntSupplier;

/**
 * Development-only automated test, registered only when the JVM runs with
 * -Dpolymodels.devtest=&lt;output dir&gt; (never in normal play). From the title screen it opens the
 * model chooser, creates a flat survival world, wears John Marston and takes screenshots in the
 * F5 views (front, back, sneaking, swinging, blocking, drawing a bow, a pumpkin on the head), of
 * other players wearing Trevor and the Roblox Noob (from the "players" config section), the
 * inventory preview, folder models (a good one, a damaged one, a truncated one), the chooser in
 * a world, Trevor, and Steve again; measures the skinning cost; writes devtest-results.txt and
 * quits the game.
 */
public final class DevTest {
    private static final Logger LOG = LogManager.getLogger("PolyModels DevTest");
    private static final String WORLD = "polymodels-devtest";
    /** Gives up after ten minutes of ticks. */
    private static final int MAX_TICKS = 20 * 600;

    private final Minecraft mc = Minecraft.getMinecraft();
    private final File out;
    private final List<IntSupplier> steps = new ArrayList<>();
    private final List<String> results = new ArrayList<>();
    private int index;
    private int wait;
    private int ticks;
    private boolean finished;
    private long countA;
    private ModelRegistry.Entry john;

    public DevTest(String outDir) {
        this.out = new File(outDir).getAbsoluteFile();
        if (!out.isDirectory() && !out.mkdirs()) LOG.warn("Could not create {}", out);
        build();
    }

    private static ModelRegistry reg() {
        return PolyModelsMod.REGISTRY;
    }

    // ------------------------------------------------------------------ the script

    private void build() {
        waitFor(() -> mc.currentScreen instanceof GuiMainMenu, 40);
        step(() -> {
            mc.displayGuiScreen(new GuiChooseModel(mc.currentScreen));
            return 30;
        });
        step(() -> {
            shot("01_chooser_title_screen");
            check("the chooser lists Steve and the three built-in models", reg().list().size() >= 3 && reg().find("john_marston") != null && reg().find("trevor") != null && reg().find("roblox_noob") != null, reg().list().size() + " models");
            mc.displayGuiScreen(null);
            return 10;
        });
        step(() -> {
            mc.gameSettings.renderDistanceChunks = 4;
            mc.gameSettings.difficulty = EnumDifficulty.PEACEFUL;
            mc.gameSettings.pauseOnLostFocus = false;
            // No "Press E to open your inventory" toast over the screenshots.
            mc.gameSettings.showInventoryAchievementHint = false;
            mc.getSaveLoader().flushCache();
            mc.getSaveLoader().deleteWorldDirectory(WORLD);
            WorldSettings settings = new WorldSettings(20260410L, WorldSettings.GameType.SURVIVAL, false, false, WorldType.FLAT).enableCommands();
            mc.launchIntegratedServer(WORLD, WORLD, settings);
            return 0;
        });
        waitFor(() -> mc.thePlayer != null && mc.theWorld != null && mc.currentScreen == null && mc.getIntegratedServer() != null, 100);
        step(() -> {
            String name = mc.thePlayer.getName();
            IntegratedServer server = mc.getIntegratedServer();
            server.addScheduledTask(() -> {
                WorldServer w = server.worldServers[0];
                w.getGameRules().setOrCreateGameRule("doDaylightCycle", "false");
                w.getGameRules().setOrCreateGameRule("doMobSpawning", "false");
                w.setWorldTime(6000);
                w.getWorldInfo().setRaining(false);
                w.getWorldInfo().setThundering(false);
                EntityPlayerMP p = server.getConfigurationManager().getPlayerByUsername(name);
                if (p == null) return;
                p.inventory.setInventorySlotContents(0, new ItemStack(Items.diamond_sword));
                p.inventory.setInventorySlotContents(1, new ItemStack(Items.bow));
                p.inventory.setInventorySlotContents(8, new ItemStack(Items.arrow, 64));
                p.setPositionAndUpdate(0.5, p.posY, 0.5);
                p.inventoryContainer.detectAndSendChanges();
            });
            return 40;
        });
        step(() -> {
            mc.thePlayer.inventory.currentItem = 0;
            look(0, 0);
            john = reg().find("john_marston");
            reg().setLocal("john_marston");
            return 0;
        });
        waitFor(() -> john.state() == ModelRegistry.State.READY || john.state() == ModelRegistry.State.FAILED, 20);
        step(() -> {
            check("John Marston decodes", john.state() == ModelRegistry.State.READY, john.error());
            mc.gameSettings.hideGUI = true;
            mc.gameSettings.thirdPersonView = 2;
            countA = draws(john);
            return 40;
        });
        step(() -> {
            shot("02_john_front_f5");
            check("the custom model is drawn in F5", draws(john) > countA, draws(john) - countA + " draws");
            mc.gameSettings.thirdPersonView = 1;
            return 30;
        });
        step(() -> {
            shot("03_john_back_f5");
            mc.gameSettings.thirdPersonView = 2;
            KeyBinding.setKeyBindState(mc.gameSettings.keyBindSneak.getKeyCode(), true);
            return 20;
        });
        step(() -> {
            check("sneaking", mc.thePlayer.isSneaking(), "");
            shot("04_john_sneaking");
            KeyBinding.setKeyBindState(mc.gameSettings.keyBindSneak.getKeyCode(), false);
            return 20;
        });
        step(() -> {
            mc.thePlayer.swingItem();
            return 2;
        });
        step(() -> {
            shot("05_john_swinging");
            return 20;
        });
        step(() -> {
            KeyBinding.setKeyBindState(mc.gameSettings.keyBindUseItem.getKeyCode(), true);
            return 15;
        });
        step(() -> {
            check("blocking with the sword", mc.thePlayer.isUsingItem(), "");
            shot("06_john_blocking");
            KeyBinding.setKeyBindState(mc.gameSettings.keyBindUseItem.getKeyCode(), false);
            return 15;
        });
        step(() -> {
            mc.thePlayer.inventory.currentItem = 1;
            return 5;
        });
        step(() -> {
            KeyBinding.setKeyBindState(mc.gameSettings.keyBindUseItem.getKeyCode(), true);
            return 20;
        });
        step(() -> {
            check("drawing the bow", mc.thePlayer.isUsingItem(), "");
            shot("07_john_bow");
            KeyBinding.setKeyBindState(mc.gameSettings.keyBindUseItem.getKeyCode(), false);
            return 20;
        });
        step(() -> {
            mc.thePlayer.inventory.currentItem = 0;
            serverPlayer(p -> p.inventory.armorInventory[3] = new ItemStack(Blocks.pumpkin));
            return 20;
        });
        step(() -> {
            check("a pumpkin on the head", mc.thePlayer.getCurrentArmor(3) != null, "");
            shot("08_john_pumpkin");
            serverPlayer(p -> p.inventory.armorInventory[3] = null);
            return 10;
        });
        // Other players: models named in the "players" config section.
        step(() -> {
            reg().setPlayer("TrevorTest", "trevor");
            reg().setPlayer("NoobTest", "roblox_noob");
            reg().setPlayer("JohnTest", "john_marston");
            mc.gameSettings.thirdPersonView = 0;
            look(0, 8);
            double x = mc.thePlayer.posX;
            double y = mc.thePlayer.posY;
            double z = mc.thePlayer.posZ + 4.5;
            spawnOther(-100, "JohnTest", x - 2.4, y, z, new ItemStack(Items.iron_sword));
            spawnOther(-101, "TrevorTest", x - 0.8, y, z, new ItemStack(Items.golden_axe));
            spawnOther(-102, "NoobTest", x + 0.8, y, z, new ItemStack(Blocks.red_flower));
            spawnOther(-103, "SteveTest", x + 2.4, y, z, new ItemStack(Items.stick));
            reg().ready("trevor");
            reg().ready("roblox_noob");
            return 0;
        });
        waitFor(() -> reg().ready("trevor") != null && reg().ready("roblox_noob") != null, 40);
        step(() -> {
            shot("09_other_players");
            check("Trevor drawn for TrevorTest", draws(reg().find("trevor")) > 0, "");
            check("the Noob drawn for NoobTest", draws(reg().find("roblox_noob")) > 0, "");
            for (int id = -100; id >= -103; id--) mc.theWorld.removeEntityFromWorld(id);
            for (String n : Arrays.asList("TrevorTest", "NoobTest", "JohnTest")) reg().setPlayer(n, null);
            mc.gameSettings.hideGUI = false;
            countA = draws(john);
            mc.displayGuiScreen(new GuiInventory(mc.thePlayer));
            return 30;
        });
        step(() -> {
            shot("10_inventory");
            check("the inventory preview uses the model", draws(john) > countA, "");
            mc.displayGuiScreen(null);
            return 10;
        });
        // Folder models: a copy of a built-in, a file that is not a model, a truncated model.
        step(() -> {
            File dir = reg().folder();
            try {
                Files.write(new File(dir, "my_noob.mcpm").toPath(), resource("/assets/polymodels/models/roblox_noob.mcpm"));
                Files.write(new File(dir, "broken.mcpm").toPath(), "not a model at all".getBytes(StandardCharsets.UTF_8));
                byte[] whole = resource("/assets/polymodels/models/john_marston.mcpm");
                Files.write(new File(dir, "truncated.mcpm").toPath(), Arrays.copyOf(whole, whole.length / 3));
            } catch (IOException e) {
                check("writing test files", false, e.toString());
            }
            reg().reloadFolder();
            ModelRegistry.Entry noob = reg().find("my_noob");
            ModelRegistry.Entry broken = reg().find("broken");
            check("a folder model is listed with its name", noob != null && "Roblox Noob".equals(noob.name) && noob.triangles == 1066, noob == null ? "missing" : noob.name + " " + noob.triangles);
            check("a file that is not a model is listed as damaged", broken != null && broken.state() == ModelRegistry.State.FAILED && "not a model file".equals(broken.error()), broken == null ? "missing" : broken.error());
            reg().setLocal("truncated");
            return 0;
        });
        waitFor(() -> reg().find("truncated").state() == ModelRegistry.State.FAILED || reg().find("truncated").state() == ModelRegistry.State.READY, 5);
        step(() -> {
            ModelRegistry.Entry t = reg().find("truncated");
            check("a truncated model fails to load (Steve stands in)", t.state() == ModelRegistry.State.FAILED && reg().ready("truncated") == null, t.state() + " " + t.error());
            reg().setLocal("my_noob");
            return 0;
        });
        waitFor(() -> reg().find("my_noob").state() == ModelRegistry.State.READY, 5);
        step(() -> {
            mc.gameSettings.thirdPersonView = 2;
            mc.gameSettings.hideGUI = true;
            look(0, 0);
            return 30;
        });
        step(() -> {
            shot("11_folder_model_f5");
            check("the folder model is drawn", draws(reg().find("my_noob")) > 0, "");
            mc.gameSettings.hideGUI = false;
            mc.displayGuiScreen(new GuiChooseModel(null));
            return 30;
        });
        step(() -> {
            shot("12_chooser_in_world");
            mc.displayGuiScreen(null);
            reg().setLocal("trevor");
            mc.gameSettings.hideGUI = true;
            return 0;
        });
        waitFor(() -> reg().ready("trevor") != null, 30);
        step(() -> {
            shot("13_trevor_f5");
            reg().setLocal("john_marston");
            PolyModel m = john.model();
            m.skinNanos = 0;
            m.draws = 0;
            return 100;
        });
        step(() -> {
            PolyModel m = john.model();
            double ms = m.draws == 0 ? 0 : m.skinNanos / 1e6 / m.draws;
            int fps = Minecraft.getDebugFPS();
            results.add(String.format("info  John Marston (%d triangles): skinning %.3f ms per draw over %d draws; %d fps under Xvfb/llvmpipe", m.triangles, ms, m.draws, fps));
            check("skinning John costs under 4 ms per draw", ms < 4.0, String.format("%.3f ms", ms));
            reg().setLocal("steve");
            countA = draws(john);
            return 40;
        });
        step(() -> {
            shot("14_steve_again_f5");
            check("Steve brings back the vanilla model", draws(john) == countA, draws(john) - countA + " custom draws");
            for (String n : Arrays.asList("my_noob.mcpm", "broken.mcpm", "truncated.mcpm")) new File(reg().folder(), n).delete();
            reg().reloadFolder();
            PolyModelsMod.forgetRenderers();
            mc.gameSettings.hideGUI = false;
            mc.gameSettings.thirdPersonView = 0;
            return 5;
        });
        step(() -> {
            finish();
            return 0;
        });
    }

    // ------------------------------------------------------------------ runner

    @SubscribeEvent
    public void onTick(TickEvent.ClientTickEvent event) {
        if (event.phase != TickEvent.Phase.END || finished) return;
        if (++ticks > MAX_TICKS) {
            check("finished in time", false, "stopped at step " + index);
            finish();
            return;
        }
        if (wait > 0) {
            wait--;
            return;
        }
        if (index >= steps.size()) return;
        int r;
        try {
            r = steps.get(index).getAsInt();
        } catch (Throwable t) {
            LOG.error("Step {} failed", index, t);
            check("step " + index + " runs", false, t.toString());
            finish();
            return;
        }
        if (r >= 0) {
            index++;
            wait = r;
        }
    }

    private void step(IntSupplier s) {
        steps.add(s);
    }

    /** Waits until the condition holds, then {@code after} more ticks. */
    private void waitFor(BooleanSupplier cond, int after) {
        steps.add(() -> cond.getAsBoolean() ? after : -1);
    }

    private void check(String name, boolean ok, String detail) {
        String line = (ok ? "ok    " : "FAIL  ") + name + (ok || detail.isEmpty() ? "" : " -> " + detail);
        results.add(line);
        LOG.info(line);
    }

    private void shot(String name) {
        ScreenShotHelper.saveScreenshot(out, name + ".png", mc.displayWidth, mc.displayHeight, mc.getFramebuffer());
        results.add("shot  " + new File(new File(out, "screenshots"), name + ".png"));
    }

    private void look(float yaw, float pitch) {
        mc.thePlayer.rotationYaw = mc.thePlayer.prevRotationYaw = yaw;
        mc.thePlayer.rotationPitch = mc.thePlayer.prevRotationPitch = pitch;
        mc.thePlayer.rotationYawHead = mc.thePlayer.prevRotationYawHead = yaw;
        mc.thePlayer.renderYawOffset = mc.thePlayer.prevRenderYawOffset = yaw;
    }

    private static long draws(ModelRegistry.Entry e) {
        return e == null || e.model() == null ? 0 : e.model().draws;
    }

    private void serverPlayer(java.util.function.Consumer<EntityPlayerMP> action) {
        String name = mc.thePlayer.getName();
        IntegratedServer server = mc.getIntegratedServer();
        server.addScheduledTask(() -> {
            EntityPlayerMP p = server.getConfigurationManager().getPlayerByUsername(name);
            if (p == null) return;
            action.accept(p);
            p.inventoryContainer.detectAndSendChanges();
        });
    }

    /** Another player standing in front of us, facing us (client side only). */
    private void spawnOther(int id, String name, double x, double y, double z, ItemStack held) {
        // Steve's default skin for every test player (an even UUID hash).
        UUID uuid = UUID.nameUUIDFromBytes(name.getBytes(StandardCharsets.UTF_8));
        for (int i = 0; (uuid.hashCode() & 1) != 0; i++) uuid = UUID.nameUUIDFromBytes((name + i).getBytes(StandardCharsets.UTF_8));
        EntityOtherPlayerMP o = new EntityOtherPlayerMP(mc.theWorld, new GameProfile(uuid, name));
        o.setLocationAndAngles(x, y, z, 180, 0);
        o.prevRotationYaw = o.rotationYaw;
        o.rotationYawHead = o.prevRotationYawHead = 180;
        o.renderYawOffset = o.prevRenderYawOffset = 180;
        o.setCurrentItemOrArmor(0, held);
        mc.theWorld.addEntityToWorld(id, o);
    }

    private static byte[] resource(String path) throws IOException {
        try (InputStream in = DevTest.class.getResourceAsStream(path)) {
            if (in == null) throw new IOException("missing " + path);
            java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
            return b.toByteArray();
        }
    }

    private void finish() {
        if (finished) return;
        finished = true;
        long fails = results.stream().filter(l -> l.startsWith("FAIL")).count();
        results.add(fails == 0 ? "PASSED" : "FAILED (" + fails + ")");
        try {
            Files.write(new File(out, "devtest-results.txt").toPath(), results, StandardCharsets.UTF_8);
        } catch (IOException e) {
            LOG.error("Could not write the results", e);
        }
        LOG.info("Development test done: {}", fails == 0 ? "passed" : fails + " failed");
        mc.shutdown();
    }
}
