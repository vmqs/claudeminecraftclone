package dev.polymodels.render;

import dev.polymodels.model.PolyModel;
import net.minecraft.client.entity.AbstractClientPlayer;
import net.minecraft.client.renderer.entity.RenderManager;
import net.minecraft.client.renderer.entity.RenderPlayer;
import net.minecraft.client.renderer.entity.RendererLivingEntity;
import net.minecraft.client.renderer.entity.layers.LayerCustomHead;
import net.minecraft.client.renderer.entity.layers.LayerHeldItem;
import net.minecraftforge.fml.relauncher.ReflectionHelper;
import org.apache.logging.log4j.LogManager;

import java.lang.reflect.Field;

/**
 * RenderPlayer with a polygon model: everything vanilla does for a player (position, sneaking
 * offset, body turn, riding, sleeping, death, hurt tint, invisibility, name tag, held item, head
 * item) with the model's mesh instead of Steve, and without the armour, cape, deadmau5 ears and
 * stuck arrows (those are shaped for Steve's boxes).
 */
public final class RenderPolyPlayer extends RenderPlayer {
    /** RendererLivingEntity.renderOutlines (protected, and only settable): MCP and SRG names. */
    private static Field outlinesField;
    private static boolean outlinesLookedUp;

    public final PolyModel model;

    /**
     * Whether a renderer is set for the entity-outline pass (RenderManager sets it on the renderer
     * it picked before doRender). False when the field cannot be read.
     */
    static boolean rendersOutlines(RendererLivingEntity<?> renderer) {
        if (!outlinesLookedUp) {
            outlinesLookedUp = true;
            try {
                outlinesField = ReflectionHelper.findField(RendererLivingEntity.class, "renderOutlines", "field_177098_i");
            } catch (Throwable t) {
                LogManager.getLogger("PolyModels").warn("Cannot read renderOutlines: spectator outlines draw players in full", t);
            }
        }
        if (outlinesField == null) return false;
        try {
            return outlinesField.getBoolean(renderer);
        } catch (Throwable t) {
            return false;
        }
    }

    public RenderPolyPlayer(RenderManager manager, PolyModel model) {
        super(manager, false);
        this.model = model;
        ModelPolyPlayer m = new ModelPolyPlayer(model);
        this.mainModel = m;
        this.layerRenderers.clear();
        this.addLayer(new LayerHeldItem(this));
        this.addLayer(new LayerCustomHead(m.bipedHead));
    }

    /** Draws in the entity-outline pass (for the development test). */
    public static long outlineDraws;

    @Override
    public void doRender(AbstractClientPlayer player, double x, double y, double z, float yaw, float partialTicks) {
        if (renderOutlines) outlineDraws++;
        super.doRender(player, x, y, z, yaw, partialTicks);
    }

    @Override
    public void renderRightArm(AbstractClientPlayer player) {
        // First person is drawn by the vanilla renderer (Steve's arm with the player's skin).
    }

    @Override
    public void renderLeftArm(AbstractClientPlayer player) {
    }
}
