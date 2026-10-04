package dev.polymodels.model;

import org.junit.Test;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Random;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * The renderer's skinning (vertices sorted by the parts that move them, one skinned copy per
 * player, only parts whose matrix changed skinned again) against a plain reference: every vertex
 * blended by its normalised weights in the file's order, as the first version of the mod did and
 * as ModelPose.partMatrices does in the web game.
 */
public class PolyModelSkinTest {
    private static byte[] resource(String path) throws IOException {
        try (InputStream in = PolyModelSkinTest.class.getResourceAsStream(path)) {
            if (in == null) throw new IOException("missing " + path);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }

    /** A random ModelBiped pose: rotation points near Steve's rest, angles within +-1 rad. */
    private static float[] randomPose(Random rnd) {
        float[] pose = new float[McpmFormat.PART_COUNT * 6];
        for (int k = 0; k < McpmFormat.PART_COUNT; k++) {
            for (int c = 0; c < 3; c++) pose[k * 6 + c] = PolyModel.STEVE_REST[k][c] + (rnd.nextFloat() - 0.5f) * 2;
            for (int c = 3; c < 6; c++) pose[k * 6 + c] = (rnd.nextFloat() - 0.5f) * 2;
        }
        return pose;
    }

    /** The reference: the file's vertices, skinned one by one with every weight (file order). */
    private static float[][] reference(McpmFormat.Data d, PolyModel model, float[] pose) {
        float[] bones = new float[McpmFormat.PART_COUNT * 12];
        for (int k = 0; k < McpmFormat.PART_COUNT; k++) {
            float[] pv = model.pivots[k];
            float[] rest = PolyModel.STEVE_REST[k];
            int p = k * 6;
            PolyModel.writeBone(bones, k * 12, pv[0] + (pose[p] - rest[0]) / 16f, pv[1] + (pose[p + 1] - rest[1]) / 16f, pv[2] + (pose[p + 2] - rest[2]) / 16f,
                    pose[p + 3], pose[p + 4], pose[p + 5], pv[0], pv[1], pv[2]);
        }
        int vc = d.vertexCount();
        float[] pos = new float[vc * 3];
        float[] nrm = new float[vc * 3];
        for (int i = 0; i < vc; i++) {
            float[] b = PolyModel.toBiped(d.positions[i * 3], d.positions[i * 3 + 1], d.positions[i * 3 + 2]);
            float nx = d.normals[i * 3], ny = -d.normals[i * 3 + 1], nz = -d.normals[i * 3 + 2];
            float len = (float) Math.sqrt(nx * nx + ny * ny + nz * nz);
            if (len > 0) {
                nx /= len;
                ny /= len;
                nz /= len;
            } else {
                nx = 0;
                ny = -1;
                nz = 0;
            }
            int sum = 0;
            for (int k = 0; k < 4; k++) sum += d.weights[i * 4 + k] & 0xff;
            float ox = 0, oy = 0, oz = 0, mx = 0, my = 0, mz = 0;
            for (int k = 0; k < 4; k++) {
                float w = sum == 0 ? (k == 0 ? 1 : 0) : (d.weights[i * 4 + k] & 0xff) / (float) sum;
                if (w == 0) continue;
                int j = (sum == 0 ? McpmFormat.PART_BODY : d.joints[i * 4 + k] & 0xff) * 12;
                ox += w * (bones[j] * b[0] + bones[j + 1] * b[1] + bones[j + 2] * b[2] + bones[j + 3]);
                oy += w * (bones[j + 4] * b[0] + bones[j + 5] * b[1] + bones[j + 6] * b[2] + bones[j + 7]);
                oz += w * (bones[j + 8] * b[0] + bones[j + 9] * b[1] + bones[j + 10] * b[2] + bones[j + 11]);
                mx += w * (bones[j] * nx + bones[j + 1] * ny + bones[j + 2] * nz);
                my += w * (bones[j + 4] * nx + bones[j + 5] * ny + bones[j + 6] * nz);
                mz += w * (bones[j + 8] * nx + bones[j + 9] * ny + bones[j + 10] * nz);
            }
            float l = (float) Math.sqrt(mx * mx + my * my + mz * mz);
            pos[i * 3] = ox;
            pos[i * 3 + 1] = oy;
            pos[i * 3 + 2] = oz;
            nrm[i * 3] = l > 1e-6f ? mx / l : nx;
            nrm[i * 3 + 1] = l > 1e-6f ? my / l : ny;
            nrm[i * 3 + 2] = l > 1e-6f ? mz / l : nz;
        }
        return new float[][]{pos, nrm};
    }

    private static void assertSkinned(String what, PolyModel model, PolyModel.SkinState st, float[][] ref) {
        int vc = model.fileVertex.length;
        float worstPos = 0, worstNrm = 0;
        for (int n = 0; n < vc; n++) {
            int i = model.fileVertex[n];
            for (int c = 0; c < 3; c++) {
                worstPos = Math.max(worstPos, Math.abs(st.pos.get(n * 3 + c) - ref[0][i * 3 + c]));
                worstNrm = Math.max(worstNrm, Math.abs(st.nrm.get(n * 3 + c) - ref[1][i * 3 + c]));
            }
        }
        assertTrue(what + ": positions off by " + worstPos, worstPos < 1e-5f);
        assertTrue(what + ": normals off by " + worstNrm, worstNrm < 1e-4f);
    }

    @Test
    public void incrementalSkinningMatchesTheReference() throws Exception {
        for (String id : new String[]{"roblox_noob", "john_marston", "trevor"}) {
            byte[] bytes = resource("/assets/polymodels/models/" + id + ".mcpm");
            McpmFormat.Data d = McpmFormat.decode(bytes);
            PolyModel model = PolyModel.decode(id, bytes);
            int vc = d.vertexCount();
            // The index list draws the same triangles through the new numbering.
            for (int t = 0; t < d.indices.length; t++) assertEquals(id + " index " + t, d.indices[t], model.fileVertex[model.indexAt(t)]);
            Random rnd = new Random(id.hashCode());
            Object playerA = new Object();
            Object playerB = new Object();
            float[] poseA = randomPose(rnd);
            model.setPose(poseA);
            long before = model.skinnedVertices;
            assertSkinned(id + " A first draw", model, model.skin(playerA), reference(d, model, poseA));
            assertEquals(id + " the first draw skins everything", vc, model.skinnedVertices - before);
            float[] poseB = randomPose(rnd);
            model.setPose(poseB);
            assertSkinned(id + " B", model, model.skin(playerB), reference(d, model, poseB));
            // Player A again with only the arms moved: only vertices touching the arms are skinned.
            float[] poseA2 = poseA.clone();
            for (int part : new int[]{McpmFormat.PART_RIGHT_ARM, McpmFormat.PART_LEFT_ARM}) poseA2[part * 6 + 5] += 0.3f;
            model.setPose(poseA2);
            before = model.skinnedVertices;
            assertSkinned(id + " A arms moved", model, model.skin(playerA), reference(d, model, poseA2));
            long partial = model.skinnedVertices - before;
            assertTrue(id + " arms only: " + partial + " of " + vc, partial > 0 && partial < vc);
            // Nothing moved: nothing skinned, same result.
            before = model.skinnedVertices;
            assertSkinned(id + " A unchanged", model, model.skin(playerA), reference(d, model, poseA2));
            assertEquals(id + " unchanged pose", 0, model.skinnedVertices - before);
            // B kept its own copy.
            model.setPose(poseB);
            assertSkinned(id + " B again", model, model.skin(playerB), reference(d, model, poseB));
            // Many random poses on one player, each changing a random set of parts.
            float[] pose = poseA2.clone();
            for (int round = 0; round < 20; round++) {
                for (int k = 0; k < McpmFormat.PART_COUNT; k++) {
                    if (rnd.nextInt(3) != 0) continue;
                    for (int c = 0; c < 6; c++) pose[k * 6 + c] = randomPose(rnd)[k * 6 + c];
                }
                model.setPose(pose);
                assertSkinned(id + " round " + round, model, model.skin(playerA), reference(d, model, pose));
            }
            assertEquals(2, model.skinStates());
        }
    }
}
