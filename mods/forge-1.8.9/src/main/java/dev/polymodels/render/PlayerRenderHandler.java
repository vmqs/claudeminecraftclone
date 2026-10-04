package dev.polymodels.render;

import dev.polymodels.model.ModelRegistry;
import dev.polymodels.model.PolyModel;
import net.minecraft.client.entity.AbstractClientPlayer;
import net.minecraftforge.client.event.RenderPlayerEvent;
import net.minecraftforge.fml.common.eventhandler.EventPriority;
import net.minecraftforge.fml.common.eventhandler.SubscribeEvent;

import java.util.IdentityHashMap;
import java.util.Map;

/**
 * Swaps the player renderer: when a player wears a polygon model (and it is loaded), vanilla's
 * RenderPlayer.doRender is cancelled and this mod's RenderPolyPlayer draws the player instead,
 * wherever players are drawn through RenderPlayer (the world, F5 views, the inventory and any
 * other GUI preview). Steve, spectators and models still loading stay vanilla.
 */
public final class PlayerRenderHandler {
    private final ModelRegistry registry;
    private final Map<PolyModel, RenderPolyPlayer> renderers = new IdentityHashMap<>();

    public PlayerRenderHandler(ModelRegistry registry) {
        this.registry = registry;
    }

    @SubscribeEvent(priority = EventPriority.HIGH)
    public void onRenderPlayer(RenderPlayerEvent.Pre event) {
        // Our own renderer posts the event too: let it through.
        if (event.renderer instanceof RenderPolyPlayer || event.isCanceled()) return;
        if (!(event.entityPlayer instanceof AbstractClientPlayer)) return;
        AbstractClientPlayer player = (AbstractClientPlayer) event.entityPlayer;
        if (player.isSpectator()) return;
        PolyModel model = registry.modelFor(player);
        if (model == null) return;
        RenderPolyPlayer r = renderers.get(model);
        if (r == null) {
            r = new RenderPolyPlayer(event.renderer.getRenderManager(), model);
            renderers.put(model, r);
        }
        event.setCanceled(true);
        // RenderManager told the vanilla renderer whether this is the entity-outline pass
        // (spectators' player highlight); the replacement must draw the same pass.
        r.setRenderOutlines(RenderPolyPlayer.rendersOutlines(event.renderer));
        float yaw = player.prevRotationYaw + (player.rotationYaw - player.prevRotationYaw) * event.partialRenderTick;
        r.doRender(player, event.x, event.y, event.z, yaw, event.partialRenderTick);
    }

    /** Drops the renderers (after the folder models were reloaded). */
    public void forget() {
        renderers.clear();
    }
}
