package dev.polymodels.model;

import net.minecraft.client.renderer.GlStateManager;
import net.minecraft.client.renderer.OpenGlHelper;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.lwjgl.BufferUtils;
import org.lwjgl.opengl.ContextCapabilities;
import org.lwjgl.opengl.EXTFramebufferObject;
import org.lwjgl.opengl.GL11;
import org.lwjgl.opengl.GL12;
import org.lwjgl.opengl.GL30;
import org.lwjgl.opengl.GLContext;

import javax.imageio.ImageIO;
import javax.imageio.ImageReadParam;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.MemoryCacheImageInputStream;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.nio.FloatBuffer;
import java.nio.IntBuffer;
import java.nio.ShortBuffer;
import java.util.Iterator;

/**
 * A player model ready to draw: the vertices moved once into ModelBiped's space ("biped space":
 * blocks, +Y down, the face towards -Z, the neck at the origin, feet at y = 1.5, before
 * RenderPlayer's 0.9375 scale), skinned on the CPU every draw by the six part matrices (each
 * vertex blends up to four parts) into reused buffers, and drawn with client-side vertex arrays
 * in whatever GL state vanilla set up (lightmap, item lighting, the hurt tint, invisibility).
 * Textures are decoded off the render thread and uploaded on the first draw.
 */
public final class PolyModel {
    private static final Logger LOG = LogManager.getLogger("PolyModels");
    /** RenderPlayer's renderPlayerScale. */
    public static final float PLAYER_SCALE = 0.9375f;
    /** Largest texture side uploaded (bigger pictures are scaled down). */
    private static final int MAX_TEXTURE_SIDE = 2048;
    /** Largest picture side accepted at all (the web game's MAX_IMAGE_SIDE). */
    static final int MAX_SOURCE_SIDE = 8192;
    /** Pictures larger than this are subsampled while decoding (at most 4096² pixels in memory). */
    private static final int MAX_DECODE_SIDE = 4096;
    /** Steve's rotation points at rest (ModelBiped's constructor), in pixels. */
    public static final float[][] STEVE_REST = {{0, 0, 0}, {0, 0, 0}, {-5, 2, 0}, {5, 2, 0}, {-1.9f, 12, 0}, {1.9f, 12, 0}};

    public final String id;
    public final String name;
    public final String credits;
    public final int triangles;
    private final int vc;
    private final float[] bindPos;
    private final float[] bindNrm;
    /** Up to four parts per vertex with weights normalised to sum to 1. */
    private final byte[] joints;
    private final float[] weights;
    private final McpmFormat.Group[] groups;
    private final McpmFormat.Material[] materials;
    /** Decoded pictures until uploaded (null entries could not be read). */
    private BufferedImage[] images;
    private int[] textureIds;
    /** Part pivots in biped space. */
    public final float[][] pivots = new float[McpmFormat.PART_COUNT][];
    /** Right palm and head centre in biped space; head height in blocks (model space). */
    public final float[] palm;
    public final float[] headCenter;
    public final float headSize;

    private final float[] outPos;
    private final float[] outNrm;
    private final FloatBuffer posBuf;
    private final FloatBuffer nrmBuf;
    private final FloatBuffer uvBuf;
    private final ShortBuffer shortIdx;
    private final IntBuffer intIdx;
    /** Row-major 3x4 per part. */
    private final float[] bones = new float[McpmFormat.PART_COUNT * 12];
    private final FloatBuffer colorScratch = BufferUtils.createFloatBuffer(16);
    private boolean disposed;

    /** Time spent skinning, for the debug log. */
    public long skinNanos;
    public int draws;

    private static int whiteTexture = -1;

    private PolyModel(String id, McpmFormat.Data d, BufferedImage[] images) {
        this.id = id;
        this.name = d.name;
        this.credits = d.credits;
        this.vc = d.vertexCount();
        this.triangles = d.indices.length / 3;
        this.bindPos = new float[vc * 3];
        this.bindNrm = new float[vc * 3];
        for (int i = 0; i < vc; i++) {
            float[] b = toBiped(d.positions[i * 3], d.positions[i * 3 + 1], d.positions[i * 3 + 2]);
            System.arraycopy(b, 0, bindPos, i * 3, 3);
            // Biped space flips y and z.
            float nx = d.normals[i * 3];
            float ny = -d.normals[i * 3 + 1];
            float nz = -d.normals[i * 3 + 2];
            float len = (float) Math.sqrt(nx * nx + ny * ny + nz * nz);
            if (len > 0) {
                bindNrm[i * 3] = nx / len;
                bindNrm[i * 3 + 1] = ny / len;
                bindNrm[i * 3 + 2] = nz / len;
            } else bindNrm[i * 3 + 1] = -1;
        }
        this.joints = d.joints;
        this.weights = new float[vc * 4];
        for (int i = 0; i < vc; i++) {
            int sum = 0;
            for (int k = 0; k < 4; k++) sum += d.weights[i * 4 + k] & 0xff;
            if (sum == 0) {
                // Unbound vertices follow the body.
                joints[i * 4] = McpmFormat.PART_BODY;
                weights[i * 4] = 1;
            } else {
                for (int k = 0; k < 4; k++) weights[i * 4 + k] = (d.weights[i * 4 + k] & 0xff) / (float) sum;
            }
        }
        this.groups = d.groups;
        this.materials = d.materials;
        this.images = images;
        for (int k = 0; k < McpmFormat.PART_COUNT; k++) pivots[k] = toBiped(d.pivots[k][0], d.pivots[k][1], d.pivots[k][2]);
        this.palm = toBiped(d.hands[0][0], d.hands[0][1], d.hands[0][2]);
        this.headCenter = toBiped(d.headCenter[0], d.headCenter[1], d.headCenter[2]);
        this.headSize = d.headSize;
        this.outPos = new float[vc * 3];
        this.outNrm = new float[vc * 3];
        this.posBuf = BufferUtils.createFloatBuffer(vc * 3);
        this.nrmBuf = BufferUtils.createFloatBuffer(vc * 3);
        this.uvBuf = BufferUtils.createFloatBuffer(vc * 2);
        uvBuf.put(d.uvs).flip();
        if (vc <= 65536) {
            shortIdx = BufferUtils.createShortBuffer(d.indices.length);
            for (int v : d.indices) shortIdx.put((short) v);
            shortIdx.flip();
            intIdx = null;
        } else {
            intIdx = BufferUtils.createIntBuffer(d.indices.length);
            intIdx.put(d.indices).flip();
            shortIdx = null;
        }
    }

    /** Model space (blocks, +Y up, +Z front, feet at 0) to biped space. */
    public static float[] toBiped(float x, float y, float z) {
        return new float[]{x / PLAYER_SCALE, 1.5f - y / PLAYER_SCALE, -z / PLAYER_SCALE};
    }

    /**
     * Decodes a model file and its textures (any thread). Textures ImageIO cannot read (WebP
     * without a plugin) are skipped with a log line: their materials draw in their plain colour.
     */
    public static PolyModel decode(String id, byte[] bytes) throws McpmFormat.McpmException {
        McpmFormat.Data d = McpmFormat.decode(bytes);
        BufferedImage[] images = new BufferedImage[d.textures.length];
        for (int i = 0; i < images.length; i++) {
            McpmFormat.Texture t = d.textures[i];
            try {
                images[i] = readImage(t.bytes);
            } catch (Exception | OutOfMemoryError e) {
                images[i] = null;
                LOG.warn("Model {}: texture {} ({}): {}", id, i, t.mime, e.toString());
            }
            if (images[i] == null) LOG.warn("Model {}: texture {} ({}) cannot be read here and is left out", id, i, t.mime);
            else images[i] = fitTexture(images[i]);
        }
        return new PolyModel(id, d, images);
    }

    /**
     * Decodes a PNG or JPEG after reading its size from the header: a small file can declare a
     * huge picture, so sides over MAX_SOURCE_SIDE are refused before any pixels are allocated, and
     * pictures over MAX_DECODE_SIDE are subsampled while decoding. Null when no reader knows the
     * format (WebP).
     */
    static BufferedImage readImage(byte[] bytes) throws java.io.IOException {
        // In memory: ImageIO's default stream may spill to a temporary file.
        try (ImageInputStream in = new MemoryCacheImageInputStream(new ByteArrayInputStream(bytes))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(in);
            if (!readers.hasNext()) return null;
            ImageReader reader = readers.next();
            try {
                reader.setInput(in, true, true);
                int w = reader.getWidth(0);
                int h = reader.getHeight(0);
                if (w <= 0 || h <= 0 || w > MAX_SOURCE_SIDE || h > MAX_SOURCE_SIDE) {
                    throw new java.io.IOException("picture " + w + "x" + h + " is larger than " + MAX_SOURCE_SIDE + " pixels");
                }
                ImageReadParam param = reader.getDefaultReadParam();
                int side = Math.max(w, h);
                if (side > MAX_DECODE_SIDE) {
                    int step = (side + MAX_DECODE_SIDE - 1) / MAX_DECODE_SIDE;
                    param.setSourceSubsampling(step, step, 0, 0);
                }
                return reader.read(0, param);
            } finally {
                reader.dispose();
            }
        }
    }

    /** Pictures larger than MAX_TEXTURE_SIDE are scaled down. */
    private static BufferedImage fitTexture(BufferedImage img) {
        int w = img.getWidth();
        int h = img.getHeight();
        if (w <= MAX_TEXTURE_SIDE && h <= MAX_TEXTURE_SIDE) return img;
        double k = (double) MAX_TEXTURE_SIDE / Math.max(w, h);
        int nw = Math.max(1, (int) Math.floor(w * k));
        int nh = Math.max(1, (int) Math.floor(h * k));
        BufferedImage out = new BufferedImage(nw, nh, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = out.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        g.drawImage(img, 0, 0, nw, nh, null);
        g.dispose();
        return out;
    }

    /**
     * Sets the six part matrices from ModelBiped's pose: {@code pose} holds, per part, the
     * rotation point (pixels) and the three angles (radians) ModelBiped.setRotationAngles left.
     * Each part's matrix is T(pivot + delta) * Rz * Ry * Rx * T(-pivot), where delta is how far
     * ModelBiped moved the rotation point from Steve's rest position (sneaking, swinging): the same
     * transform ModelRenderer.render applies to a box.
     */
    public void setPose(float[] pose) {
        for (int k = 0; k < McpmFormat.PART_COUNT; k++) {
            int p = k * 6;
            float[] pv = pivots[k];
            float[] rest = STEVE_REST[k];
            float qx = pv[0] + (pose[p] - rest[0]) / 16f;
            float qy = pv[1] + (pose[p + 1] - rest[1]) / 16f;
            float qz = pv[2] + (pose[p + 2] - rest[2]) / 16f;
            writeBone(bones, k * 12, qx, qy, qz, pose[p + 3], pose[p + 4], pose[p + 5], pv[0], pv[1], pv[2]);
        }
    }

    /** T(q) * Rz(az) * Ry(ay) * Rx(ax) * T(-pv) as a row-major 3x4 matrix. */
    static void writeBone(float[] out, int o, float qx, float qy, float qz, float ax, float ay, float az, float px, float py, float pz) {
        float cx = (float) Math.cos(ax);
        float sx = (float) Math.sin(ax);
        float cy = (float) Math.cos(ay);
        float sy = (float) Math.sin(ay);
        float cz = (float) Math.cos(az);
        float sz = (float) Math.sin(az);
        float r00 = cz * cy;
        float r01 = cz * sy * sx - sz * cx;
        float r02 = cz * sy * cx + sz * sx;
        float r10 = sz * cy;
        float r11 = sz * sy * sx + cz * cx;
        float r12 = sz * sy * cx - cz * sx;
        float r20 = -sy;
        float r21 = cy * sx;
        float r22 = cy * cx;
        out[o] = r00;
        out[o + 1] = r01;
        out[o + 2] = r02;
        out[o + 3] = qx - (r00 * px + r01 * py + r02 * pz);
        out[o + 4] = r10;
        out[o + 5] = r11;
        out[o + 6] = r12;
        out[o + 7] = qy - (r10 * px + r11 * py + r12 * pz);
        out[o + 8] = r20;
        out[o + 9] = r21;
        out[o + 10] = r22;
        out[o + 11] = qz - (r20 * px + r21 * py + r22 * pz);
    }

    /** Skins every vertex by the current part matrices into the vertex and normal buffers. */
    private void skin() {
        long t0 = System.nanoTime();
        final float[] b = bones;
        final float[] p = bindPos;
        final float[] n = bindNrm;
        final float[] op = outPos;
        final float[] on = outNrm;
        for (int i = 0; i < vc; i++) {
            int i3 = i * 3;
            float x = p[i3], y = p[i3 + 1], z = p[i3 + 2];
            float nx = n[i3], ny = n[i3 + 1], nz = n[i3 + 2];
            float ox = 0, oy = 0, oz = 0, mx = 0, my = 0, mz = 0;
            for (int k = 0; k < 4; k++) {
                float w = weights[i * 4 + k];
                if (w == 0) continue;
                int j = (joints[i * 4 + k] & 0xff) * 12;
                ox += w * (b[j] * x + b[j + 1] * y + b[j + 2] * z + b[j + 3]);
                oy += w * (b[j + 4] * x + b[j + 5] * y + b[j + 6] * z + b[j + 7]);
                oz += w * (b[j + 8] * x + b[j + 9] * y + b[j + 10] * z + b[j + 11]);
                mx += w * (b[j] * nx + b[j + 1] * ny + b[j + 2] * nz);
                my += w * (b[j + 4] * nx + b[j + 5] * ny + b[j + 6] * nz);
                mz += w * (b[j + 8] * nx + b[j + 9] * ny + b[j + 10] * nz);
            }
            op[i3] = ox;
            op[i3 + 1] = oy;
            op[i3 + 2] = oz;
            float len = (float) Math.sqrt(mx * mx + my * my + mz * mz);
            if (len > 1e-6f) {
                on[i3] = mx / len;
                on[i3 + 1] = my / len;
                on[i3 + 2] = mz / len;
            } else {
                on[i3] = nx;
                on[i3 + 1] = ny;
                on[i3 + 2] = nz;
            }
        }
        posBuf.clear();
        posBuf.put(op).flip();
        nrmBuf.clear();
        nrmBuf.put(on).flip();
        skinNanos += System.nanoTime() - t0;
    }

    /**
     * Draws the model posed by {@link #setPose} with the current matrices and GL state. Each
     * material multiplies the current colour (vanilla's invisibility alpha); with texturing off
     * (outlines) the plain current colour is used.
     */
    public void draw() {
        if (disposed) return;
        if (images != null) uploadTextures();
        skin();
        draws++;
        colorScratch.clear();
        GL11.glGetFloat(GL11.GL_CURRENT_COLOR, colorScratch);
        float r = colorScratch.get(0), g = colorScratch.get(1), bl = colorScratch.get(2), a = colorScratch.get(3);
        boolean textured = GL11.glIsEnabled(GL11.GL_TEXTURE_2D);
        boolean blendWasOn = GL11.glIsEnabled(GL11.GL_BLEND);
        boolean blending = false;
        if (OpenGlHelper.vboSupported) OpenGlHelper.glBindBuffer(OpenGlHelper.GL_ARRAY_BUFFER, 0);
        GL11.glEnableClientState(GL11.GL_VERTEX_ARRAY);
        GL11.glVertexPointer(3, 0, posBuf);
        GL11.glEnableClientState(GL11.GL_NORMAL_ARRAY);
        GL11.glNormalPointer(0, nrmBuf);
        OpenGlHelper.setClientActiveTexture(OpenGlHelper.defaultTexUnit);
        GL11.glEnableClientState(GL11.GL_TEXTURE_COORD_ARRAY);
        GL11.glTexCoordPointer(2, 0, uvBuf);
        try {
            for (McpmFormat.Group grp : groups) {
                if (grp.count == 0) continue;
                McpmFormat.Material m = materials[grp.material];
                if (textured) {
                    GlStateManager.color(r * m.color[0] / 255f, g * m.color[1] / 255f, bl * m.color[2] / 255f, a * m.color[3] / 255f);
                    int tex = m.texture >= 0 && m.texture < textureIds.length ? textureIds[m.texture] : -1;
                    GlStateManager.bindTexture(tex >= 0 ? tex : whiteTexture());
                    if (m.alpha == McpmFormat.ALPHA_BLEND && !blendWasOn && !blending) {
                        GlStateManager.enableBlend();
                        GlStateManager.tryBlendFuncSeparate(GL11.GL_SRC_ALPHA, GL11.GL_ONE_MINUS_SRC_ALPHA, GL11.GL_ONE, GL11.GL_ZERO);
                        GlStateManager.depthMask(false);
                        blending = true;
                    }
                }
                if (shortIdx != null) {
                    shortIdx.limit(grp.start + grp.count).position(grp.start);
                    GL11.glDrawElements(GL11.GL_TRIANGLES, shortIdx);
                } else {
                    intIdx.limit(grp.start + grp.count).position(grp.start);
                    GL11.glDrawElements(GL11.GL_TRIANGLES, intIdx);
                }
            }
        } finally {
            if (shortIdx != null) shortIdx.clear();
            if (intIdx != null) intIdx.clear();
            GL11.glDisableClientState(GL11.GL_VERTEX_ARRAY);
            GL11.glDisableClientState(GL11.GL_NORMAL_ARRAY);
            GL11.glDisableClientState(GL11.GL_TEXTURE_COORD_ARRAY);
            if (blending) {
                GlStateManager.disableBlend();
                GlStateManager.depthMask(true);
            }
            GlStateManager.color(r, g, bl, a);
        }
    }

    /** Uploads the decoded pictures as mipmapped, repeating GL textures (render thread). */
    private void uploadTextures() {
        BufferedImage[] imgs = images;
        images = null;
        textureIds = new int[imgs.length];
        for (int i = 0; i < imgs.length; i++) {
            textureIds[i] = imgs[i] == null ? -1 : upload(imgs[i], true);
            imgs[i] = null;
        }
    }

    private static int upload(BufferedImage img, boolean mipmaps) {
        int w = img.getWidth();
        int h = img.getHeight();
        int[] argb = img.getRGB(0, 0, w, h, null, 0, w);
        IntBuffer buf = BufferUtils.createIntBuffer(w * h);
        buf.put(argb).flip();
        int id = GL11.glGenTextures();
        GlStateManager.bindTexture(id);
        GL11.glTexParameteri(GL11.GL_TEXTURE_2D, GL11.GL_TEXTURE_WRAP_S, GL11.GL_REPEAT);
        GL11.glTexParameteri(GL11.GL_TEXTURE_2D, GL11.GL_TEXTURE_WRAP_T, GL11.GL_REPEAT);
        GL11.glTexParameteri(GL11.GL_TEXTURE_2D, GL11.GL_TEXTURE_MAG_FILTER, GL11.GL_LINEAR);
        GL11.glPixelStorei(GL11.GL_UNPACK_ROW_LENGTH, 0);
        GL11.glPixelStorei(GL11.GL_UNPACK_SKIP_PIXELS, 0);
        GL11.glPixelStorei(GL11.GL_UNPACK_SKIP_ROWS, 0);
        GL11.glPixelStorei(GL11.GL_UNPACK_ALIGNMENT, 4);
        GL11.glTexImage2D(GL11.GL_TEXTURE_2D, 0, GL11.GL_RGBA, w, h, 0, GL12.GL_BGRA, GL12.GL_UNSIGNED_INT_8_8_8_8_REV, buf);
        boolean mipped = false;
        if (mipmaps) {
            ContextCapabilities caps = GLContext.getCapabilities();
            if (caps.OpenGL30) {
                GL30.glGenerateMipmap(GL11.GL_TEXTURE_2D);
                mipped = true;
            } else if (caps.GL_EXT_framebuffer_object) {
                EXTFramebufferObject.glGenerateMipmapEXT(GL11.GL_TEXTURE_2D);
                mipped = true;
            }
        }
        GL11.glTexParameteri(GL11.GL_TEXTURE_2D, GL12.GL_TEXTURE_MAX_LEVEL, mipped ? 1000 : 0);
        GL11.glTexParameteri(GL11.GL_TEXTURE_2D, GL11.GL_TEXTURE_MIN_FILTER, mipped ? GL11.GL_LINEAR_MIPMAP_LINEAR : GL11.GL_LINEAR);
        return id;
    }

    /** A 1x1 white texture for untextured materials (keeps texturing and the hurt tint uniform). */
    private static int whiteTexture() {
        if (whiteTexture < 0) {
            BufferedImage white = new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB);
            white.setRGB(0, 0, 0xffffffff);
            whiteTexture = upload(white, false);
        }
        return whiteTexture;
    }

    /** Frees the GL textures (render thread). */
    public void dispose() {
        if (disposed) return;
        disposed = true;
        if (textureIds != null) {
            for (int t : textureIds) if (t >= 0) GlStateManager.deleteTexture(t);
        }
        images = null;
    }
}
