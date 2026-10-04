package dev.polymodels;

import dev.polymodels.dev.DevTest;
import dev.polymodels.gui.GuiChooseModel;
import dev.polymodels.model.ModelRegistry;
import dev.polymodels.render.PlayerRenderHandler;
import net.minecraft.client.Minecraft;
import net.minecraft.client.settings.KeyBinding;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.fml.client.registry.ClientRegistry;
import net.minecraftforge.fml.common.FMLCommonHandler;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.common.event.FMLInitializationEvent;
import net.minecraftforge.fml.common.event.FMLPreInitializationEvent;
import net.minecraftforge.fml.common.eventhandler.SubscribeEvent;
import net.minecraftforge.fml.common.gameevent.InputEvent;
import org.apache.logging.log4j.LogManager;
import org.lwjgl.input.Keyboard;

/**
 * Poly Player Models: players wear polygon models (the web game's .mcpm files) instead of Steve,
 * animated by ModelBiped's own poses. Client-side only: servers and other players need nothing.
 */
@Mod(modid = PolyModelsMod.MODID, name = PolyModelsMod.NAME, version = PolyModelsMod.VERSION,
        clientSideOnly = true, acceptableRemoteVersions = "*", acceptedMinecraftVersions = "[1.8.9]",
        guiFactory = "dev.polymodels.gui.GuiFactory")
public class PolyModelsMod {
    public static final String MODID = "polymodels";
    public static final String NAME = "Poly Player Models";
    public static final String VERSION = "1.0.0";

    /** The models and the choices (config/polymodels.cfg). */
    public static final ModelRegistry REGISTRY = new ModelRegistry();
    private static PlayerRenderHandler renderHandler;
    private static KeyBinding chooseKey;

    @Mod.EventHandler
    public void preInit(FMLPreInitializationEvent event) {
        REGISTRY.init(event.getModConfigurationDirectory());
    }

    @Mod.EventHandler
    public void init(FMLInitializationEvent event) {
        chooseKey = new KeyBinding("key.polymodels.choose", Keyboard.KEY_M, "key.categories.polymodels");
        ClientRegistry.registerKeyBinding(chooseKey);
        renderHandler = new PlayerRenderHandler(REGISTRY);
        MinecraftForge.EVENT_BUS.register(renderHandler);
        // Input events go through FML's bus in 1.8.9 (registering on both is harmless).
        FMLCommonHandler.instance().bus().register(this);
        // Start decoding the chosen model now so the first frame in a world can use it.
        REGISTRY.ready(REGISTRY.local());
        // Development only: an automated in-game test, inert unless -Dpolymodels.devtest=<dir> is set.
        String dev = System.getProperty("polymodels.devtest");
        if (dev != null && !dev.isEmpty()) {
            LogManager.getLogger("PolyModels").warn("Development test hook enabled (polymodels.devtest={})", dev);
            DevTest test = new DevTest(dev);
            FMLCommonHandler.instance().bus().register(test);
            MinecraftForge.EVENT_BUS.register(test);
        }
    }

    @SubscribeEvent
    public void onKeyInput(InputEvent.KeyInputEvent event) {
        Minecraft mc = Minecraft.getMinecraft();
        if (chooseKey != null && chooseKey.isPressed() && mc.currentScreen == null) mc.displayGuiScreen(new GuiChooseModel(null));
    }

    /** Drops cached renderers after the folder models were reloaded. */
    public static void forgetRenderers() {
        if (renderHandler != null) renderHandler.forget();
    }
}
