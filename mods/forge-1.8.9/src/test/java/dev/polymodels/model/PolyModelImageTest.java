package dev.polymodels.model;

import org.junit.Test;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.zip.CRC32;
import java.util.zip.Deflater;
import java.util.zip.DeflaterOutputStream;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/** Texture pictures: the size is read from the header before any pixels are allocated. */
public class PolyModelImageTest {
    private static void chunk(DataOutputStream out, String type, byte[] data) throws IOException {
        byte[] t = type.getBytes(StandardCharsets.US_ASCII);
        out.writeInt(data.length);
        out.write(t);
        out.write(data);
        CRC32 crc = new CRC32();
        crc.update(t);
        crc.update(data);
        out.writeInt((int) crc.getValue());
    }

    /** A small PNG file that declares a w x h RGBA picture (its data covers one row only). */
    static byte[] declaredPng(int w, int h) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        DataOutputStream out = new DataOutputStream(bytes);
        out.write(new byte[]{(byte) 137, 80, 78, 71, 13, 10, 26, 10});
        ByteArrayOutputStream ihdr = new ByteArrayOutputStream();
        DataOutputStream ih = new DataOutputStream(ihdr);
        ih.writeInt(w);
        ih.writeInt(h);
        ih.write(new byte[]{8, 6, 0, 0, 0});
        chunk(out, "IHDR", ihdr.toByteArray());
        ByteArrayOutputStream idat = new ByteArrayOutputStream();
        try (DeflaterOutputStream z = new DeflaterOutputStream(idat, new Deflater(9))) {
            z.write(new byte[1 + w * 4]);
        }
        chunk(out, "IDAT", idat.toByteArray());
        chunk(out, "IEND", new byte[0]);
        return bytes.toByteArray();
    }

    private static byte[] png(BufferedImage img) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "png", out);
        return out.toByteArray();
    }

    @Test
    public void hugeDeclaredPictureIsRefusedBeforeDecoding() throws IOException {
        byte[] bomb = declaredPng(14000, 14000);
        assertTrue(bomb.length < 200_000);
        long t0 = System.nanoTime();
        try {
            PolyModel.readImage(bomb);
            fail("a 14000x14000 picture was decoded");
        } catch (IOException expected) {
            assertTrue(expected.getMessage(), expected.getMessage().contains("14000x14000"));
        }
        // Only the header was read (decoding would allocate 784 MB and take seconds).
        assertTrue((System.nanoTime() - t0) / 1_000_000 < 2000);
        try {
            PolyModel.readImage(declaredPng(10, PolyModel.MAX_SOURCE_SIDE + 1));
            fail("a picture taller than the limit was decoded");
        } catch (IOException expected) {
            // refused
        }
    }

    @Test
    public void largePicturesAreSubsampledWhileDecoding() throws IOException {
        BufferedImage wide = new BufferedImage(6000, 8, BufferedImage.TYPE_INT_ARGB);
        for (int x = 0; x < 6000; x++) wide.setRGB(x, 0, x % 2 == 0 ? 0xffff0000 : 0xff0000ff);
        BufferedImage got = PolyModel.readImage(png(wide));
        assertEquals(3000, got.getWidth());
        assertEquals(4, got.getHeight());
        // Every second column: the red ones.
        assertEquals(0xffff0000, got.getRGB(17, 0));
    }

    @Test
    public void ordinaryPicturesDecodeAsTheyAre() throws IOException {
        BufferedImage img = new BufferedImage(64, 32, BufferedImage.TYPE_INT_ARGB);
        img.setRGB(5, 7, 0x80123456);
        BufferedImage got = PolyModel.readImage(png(img));
        assertEquals(64, got.getWidth());
        assertEquals(32, got.getHeight());
        assertEquals(0x80123456, got.getRGB(5, 7));
        // The largest side allowed is still read (subsampled to 4096).
        BufferedImage limit = PolyModel.readImage(declaredPngFull(PolyModel.MAX_SOURCE_SIDE, 2));
        assertEquals(4096, limit.getWidth());
    }

    /** A complete PNG of w x h transparent pixels. */
    private static byte[] declaredPngFull(int w, int h) throws IOException {
        return png(new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB));
    }

    @Test
    public void unknownFormatsGiveNull() throws IOException {
        // A WebP header (RIFF....WEBP): no reader in a plain Java 8.
        byte[] webp = "RIFF\0\0\0\0WEBPVP8 \0\0\0\0".getBytes(StandardCharsets.ISO_8859_1);
        assertNull(PolyModel.readImage(webp));
    }
}
