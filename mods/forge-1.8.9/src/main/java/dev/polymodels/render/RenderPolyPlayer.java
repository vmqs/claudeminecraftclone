package dev.polymodels.render;

import dev.polymodels.model.PolyModel;
import net.minecraft.client.entity.AbstractClientPlayer;
import net.minecraft.client.renderer.entity.RenderManager;
import net.minecraft.client.renderer.entity.RenderPlayer;
import net.minecraft.client.renderer.entity.layers.LayerCustomHead;
import net.minecraft.client.renderer.entity.layers.LayerHeldItem;

/**
 * RenderPlayer with a polygon model: everything vanilla does for a player (position, sneaking
 * offset, body turn, riding, sleeping, death, hurt tint, invisibility, name tag, held item, head
 * item) with the model's mesh instead of Steve, and without the armour, cape, deadmau5 ears and
 * stuck arrows (those are shaped for Steve's boxes).
 */
public final class RenderPolyPlayer extends RenderPlayer {
    public final PolyModel model;

    public RenderPolyPlayer(RenderManager manager, PolyModel model) {
        super(manager, false);
        this.model = model;
        ModelPolyPlayer m = new ModelPolyPlayer(model);
        this.mainModel = m;
        this.layerRenderers.clear();
        this.addLayer(new LayerHeldItem(this));
        this.addLayer(new LayerCustomHead(m.bipedHead));
    }

    @Override
    public void renderRightArm(AbstractClientPlayer player) {
        // First person is drawn by the vanilla renderer (Steve's arm with the player's skin).
    }

    @Override
    public void renderLeftArm(AbstractClientPlayer player) {
    }
}
