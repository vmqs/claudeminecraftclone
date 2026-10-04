package dev.polymodels.render;

import dev.polymodels.model.McpmFormat;
import dev.polymodels.model.PolyModel;
import net.minecraft.client.model.ModelPlayer;
import net.minecraft.client.model.ModelRenderer;
import net.minecraft.client.renderer.GlStateManager;
import net.minecraft.entity.Entity;

/**
 * ModelPlayer for a polygon model: ModelBiped's own animation (setRotationAngles: walking, head
 * turns, swinging, sneaking, riding, bow and blocking poses) drives the model's six parts through
 * CPU skinning instead of drawing Steve's boxes. After each pose the parts' ModelRenderers are
 * moved onto the model's own joints, so whatever vanilla attaches to them sits on this body: the
 * held item (LayerHeldItem → postRenderArm, moved on to the model's palm) and head items
 * (LayerCustomHead → bipedHead.postRender, moved and scaled to the model's head).
 */
public final class ModelPolyPlayer extends ModelPlayer {
    /** Where Steve holds an item, relative to his right shoulder pivot (pixels): the palm. */
    private static final float[] STEVE_PALM = {-1, 8, 0};
    /** Steve's head: its centre relative to the neck pivot, and its height (pixels). */
    private static final float[] STEVE_HEAD_CENTRE = {0, -4, 0};
    private static final float STEVE_HEAD_SIZE = 8;

    public final PolyModel mesh;
    private final ModelRenderer[] parts;
    /** Per part: rotation point (pixels) and angles as ModelBiped left them, before the move. */
    private final float[] pose = new float[McpmFormat.PART_COUNT * 6];
    private final float[] palmShift;

    public ModelPolyPlayer(PolyModel mesh) {
        super(0.0F, false);
        this.mesh = mesh;
        this.isChild = false;
        float[] head = mesh.pivots[McpmFormat.PART_HEAD];
        float[] centre = mesh.headCenter;
        float headScale = mesh.headSize / PolyModel.PLAYER_SCALE / (STEVE_HEAD_SIZE / 16f);
        // The head attachment: moved to the model's head centre and scaled to its size.
        ShiftedModelRenderer headRenderer = new ShiftedModelRenderer(this, 0, 0,
                centre[0] - head[0] - STEVE_HEAD_CENTRE[0] / 16f,
                centre[1] - head[1] - STEVE_HEAD_CENTRE[1] / 16f,
                centre[2] - head[2] - STEVE_HEAD_CENTRE[2] / 16f,
                headScale, -0.25f);
        headRenderer.addBox(-4.0F, -8.0F, -4.0F, 8, 8, 8, 0.0F);
        this.bipedHead = headRenderer;
        float[] arm = mesh.pivots[McpmFormat.PART_RIGHT_ARM];
        float[] palm = mesh.palm;
        this.palmShift = new float[]{
                (palm[0] - arm[0]) - STEVE_PALM[0] / 16f,
                (palm[1] - arm[1]) - STEVE_PALM[1] / 16f,
                (palm[2] - arm[2]) - STEVE_PALM[2] / 16f};
        this.parts = new ModelRenderer[]{bipedHead, bipedBody, bipedRightArm, bipedLeftArm, bipedRightLeg, bipedLeftLeg};
    }

    @Override
    public void setRotationAngles(float limbSwing, float limbAmount, float age, float headYaw, float headPitch, float scale, Entity entity) {
        // ModelBiped leaves some rotation points alone: start from Steve's rest every time.
        for (int k = 0; k < McpmFormat.PART_COUNT; k++) {
            float[] r = PolyModel.STEVE_REST[k];
            parts[k].setRotationPoint(r[0], r[1], r[2]);
        }
        super.setRotationAngles(limbSwing, limbAmount, age, headYaw, headPitch, scale, entity);
        for (int k = 0; k < McpmFormat.PART_COUNT; k++) {
            ModelRenderer r = parts[k];
            int p = k * 6;
            pose[p] = r.rotationPointX;
            pose[p + 1] = r.rotationPointY;
            pose[p + 2] = r.rotationPointZ;
            pose[p + 3] = r.rotateAngleX;
            pose[p + 4] = r.rotateAngleY;
            pose[p + 5] = r.rotateAngleZ;
            // Attachments follow this body's joints.
            float[] rest = PolyModel.STEVE_REST[k];
            float[] pv = mesh.pivots[k];
            r.setRotationPoint(pv[0] * 16 + (pose[p] - rest[0]), pv[1] * 16 + (pose[p + 1] - rest[1]), pv[2] * 16 + (pose[p + 2] - rest[2]));
        }
        bipedHeadwear.setRotationPoint(bipedHead.rotationPointX, bipedHead.rotationPointY, bipedHead.rotationPointZ);
    }

    @Override
    public void render(Entity entity, float limbSwing, float limbAmount, float age, float headYaw, float headPitch, float scale) {
        setRotationAngles(limbSwing, limbAmount, age, headYaw, headPitch, scale, entity);
        GlStateManager.pushMatrix();
        // ModelBiped.render lowers a sneaking body by 0.2.
        if (entity != null && entity.isSneaking()) GlStateManager.translate(0.0F, 0.2F, 0.0F);
        mesh.setPose(pose);
        // Each player keeps its own skinned copy (only parts that moved are skinned again).
        mesh.draw(entity);
        GlStateManager.popMatrix();
    }

    /** The held item: on Steve's palm, then moved to the model's (LayerHeldItem calls this). */
    @Override
    public void postRenderArm(float scale) {
        bipedRightArm.postRender(scale);
        GlStateManager.translate(palmShift[0], palmShift[1], palmShift[2]);
    }

    /** First person keeps vanilla's arm (RenderPlayer.renderRightArm uses the vanilla model). */
    @Override
    public void renderRightArm() {
    }

    @Override
    public void renderLeftArm() {
    }
}
