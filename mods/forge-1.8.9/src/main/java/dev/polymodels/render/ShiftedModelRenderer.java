package dev.polymodels.render;

import net.minecraft.client.model.ModelBase;
import net.minecraft.client.model.ModelRenderer;
import net.minecraft.client.renderer.GlStateManager;

/**
 * A ModelRenderer whose attachment frame (postRender) is moved by a fixed offset and scaled about
 * a point: the head of a polygon model, so pumpkins and skulls (LayerCustomHead) sit on its head
 * at its size. Never drawn itself.
 */
final class ShiftedModelRenderer extends ModelRenderer {
    private final float dx;
    private final float dy;
    private final float dz;
    private final float scale;
    /** Height of the scaling centre in the shifted frame (Steve's head centre: -0.25). */
    private final float centreY;

    ShiftedModelRenderer(ModelBase model, int u, int v, float dx, float dy, float dz, float scale, float centreY) {
        super(model, u, v);
        this.dx = dx;
        this.dy = dy;
        this.dz = dz;
        this.scale = scale;
        this.centreY = centreY;
    }

    @Override
    public void postRender(float s) {
        super.postRender(s);
        GlStateManager.translate(dx, dy + centreY, dz);
        GlStateManager.scale(scale, scale, scale);
        GlStateManager.translate(0.0F, -centreY, 0.0F);
    }
}
