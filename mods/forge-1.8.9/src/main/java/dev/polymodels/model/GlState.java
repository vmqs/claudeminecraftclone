package dev.polymodels.model;

import net.minecraft.client.renderer.GlStateManager;
import net.minecraftforge.fml.relauncher.ReflectionHelper;
import org.apache.logging.log4j.LogManager;
import org.lwjgl.BufferUtils;
import org.lwjgl.opengl.GL11;

import java.lang.reflect.Field;
import java.nio.FloatBuffer;

/**
 * The current colour and whether texturing and blending are on, read from GlStateManager's own
 * cache (what vanilla's rendering trusts) instead of glGet / glIsEnabled, which can stall a
 * threaded driver once per player drawn. The cache is private, so it is read by reflection (MCP
 * names in development, SRG names in a normal install); when that fails, or the colour cache says
 * "unknown" (resetColor), GL is asked. Render thread only.
 */
final class GlState {
    private static boolean looked;
    private static boolean ok;
    private static Field colorState;
    private static Field red;
    private static Field green;
    private static Field blue;
    private static Field alpha;
    private static Field textureState;
    private static Field activeTextureUnit;
    private static Field texture2DState;
    private static Field blendState;
    private static Field blend;
    private static Field currentState;
    private static final FloatBuffer COLOR = BufferUtils.createFloatBuffer(16);
    private static final float[] RGBA = new float[4];

    private GlState() {
    }

    private static void lookUp() {
        looked = true;
        try {
            colorState = ReflectionHelper.findField(GlStateManager.class, "colorState", "field_179170_t");
            Class<?> color = colorState.getType();
            red = ReflectionHelper.findField(color, "red", "field_179195_a");
            green = ReflectionHelper.findField(color, "green", "field_179193_b");
            blue = ReflectionHelper.findField(color, "blue", "field_179194_c");
            alpha = ReflectionHelper.findField(color, "alpha", "field_179192_d");
            textureState = ReflectionHelper.findField(GlStateManager.class, "textureState", "field_179174_p");
            activeTextureUnit = ReflectionHelper.findField(GlStateManager.class, "activeTextureUnit", "field_179162_o");
            texture2DState = ReflectionHelper.findField(textureState.getType().getComponentType(), "texture2DState", "field_179060_a");
            blendState = ReflectionHelper.findField(GlStateManager.class, "blendState", "field_179157_e");
            blend = ReflectionHelper.findField(blendState.getType(), "blend", "field_179213_a");
            currentState = ReflectionHelper.findField(texture2DState.getType(), "currentState", "field_179201_b");
            ok = true;
        } catch (Throwable t) {
            LogManager.getLogger("PolyModels").warn("GlStateManager's state cache cannot be read; asking GL instead", t);
        }
    }

    /** The current colour (RGBA; the returned array is reused). */
    static float[] color() {
        if (!looked) lookUp();
        if (ok) {
            try {
                Object c = colorState.get(null);
                RGBA[0] = red.getFloat(c);
                RGBA[1] = green.getFloat(c);
                RGBA[2] = blue.getFloat(c);
                RGBA[3] = alpha.getFloat(c);
                // resetColor() marks the colour unknown with -1.
                if (RGBA[0] >= 0 && RGBA[1] >= 0 && RGBA[2] >= 0 && RGBA[3] >= 0) return RGBA;
            } catch (Throwable t) {
                ok = false;
            }
        }
        COLOR.clear();
        GL11.glGetFloat(GL11.GL_CURRENT_COLOR, COLOR);
        for (int i = 0; i < 4; i++) RGBA[i] = COLOR.get(i);
        return RGBA;
    }

    /** Whether 2D texturing is on for the active texture unit. */
    static boolean texture2D() {
        if (!looked) lookUp();
        if (ok) {
            try {
                Object[] units = (Object[]) textureState.get(null);
                int unit = activeTextureUnit.getInt(null);
                if (unit >= 0 && unit < units.length) return currentState.getBoolean(texture2DState.get(units[unit]));
            } catch (Throwable t) {
                ok = false;
            }
        }
        return GL11.glIsEnabled(GL11.GL_TEXTURE_2D);
    }

    /** Whether blending is on. */
    static boolean blend() {
        if (!looked) lookUp();
        if (ok) {
            try {
                return currentState.getBoolean(blend.get(blendState.get(null)));
            } catch (Throwable t) {
                ok = false;
            }
        }
        return GL11.glIsEnabled(GL11.GL_BLEND);
    }

    /** Whether the cache is used (for the development test). */
    static boolean usesCache() {
        if (!looked) lookUp();
        return ok;
    }
}
