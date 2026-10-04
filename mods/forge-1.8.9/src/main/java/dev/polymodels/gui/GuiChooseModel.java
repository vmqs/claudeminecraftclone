package dev.polymodels.gui;

import dev.polymodels.PolyModelsMod;
import dev.polymodels.model.ModelRegistry;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiButton;
import net.minecraft.client.gui.GuiScreen;
import net.minecraft.client.gui.GuiSlot;
import net.minecraft.client.gui.inventory.GuiInventory;
import net.minecraft.client.renderer.GlStateManager;
import org.lwjgl.Sys;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * "Choose Player Model" (key M, or Config in the Mods list): Steve, the built-in models and the
 * models in config/polymodels, with a live preview of your player (in a world). Clicking a row
 * wears the model at once and saves the choice; "Reload folder" picks up new files.
 */
public class GuiChooseModel extends GuiScreen {
    private static final int BUTTON_DONE = 0;
    private static final int BUTTON_RELOAD = 1;
    private static final int BUTTON_FOLDER = 2;

    private final GuiScreen parent;
    private ModelList list;
    private List<String> ids = new ArrayList<>();
    private String status = "";
    private int statusColor = 0xa0a0a0;

    public GuiChooseModel(GuiScreen parent) {
        this.parent = parent;
    }

    private static ModelRegistry registry() {
        return PolyModelsMod.REGISTRY;
    }

    private void refreshIds() {
        List<String> out = new ArrayList<>();
        out.add(ModelRegistry.STEVE);
        for (ModelRegistry.Entry e : registry().list()) out.add(e.id);
        ids = out;
    }

    @Override
    public void initGui() {
        refreshIds();
        int listRight = width / 2 + 20;
        int listLeft = Math.max(4, width / 2 - 160);
        list = new ModelList(mc, listRight - listLeft, height, 32, height - 58, 26);
        list.setSlotXBoundsFromLeft(listLeft);
        buttonList.clear();
        buttonList.add(new GuiButton(BUTTON_FOLDER, width / 2 - 154, height - 28, 100, 20, "Open folder"));
        buttonList.add(new GuiButton(BUTTON_RELOAD, width / 2 - 50, height - 28, 100, 20, "Reload folder"));
        buttonList.add(new GuiButton(BUTTON_DONE, width / 2 + 54, height - 28, 100, 20, "Done"));
    }

    @Override
    public void handleMouseInput() throws IOException {
        super.handleMouseInput();
        list.handleMouseInput();
    }

    @Override
    protected void actionPerformed(GuiButton button) {
        if (!button.enabled) return;
        if (button.id == BUTTON_DONE) {
            mc.displayGuiScreen(parent);
        } else if (button.id == BUTTON_RELOAD) {
            registry().reloadFolder();
            PolyModelsMod.forgetRenderers();
            refreshIds();
            int n = registry().list().size() - (int) registry().list().stream().filter(e -> e.builtin).count();
            setStatus(n == 1 ? "1 model in the folder" : n + " models in the folder", 0x55ff55);
        } else if (button.id == BUTTON_FOLDER) {
            openFolder(registry().folder());
        }
    }

    private void setStatus(String text, int color) {
        status = text;
        statusColor = color;
    }

    private void openFolder(File dir) {
        try {
            java.awt.Desktop.getDesktop().open(dir);
            return;
        } catch (Throwable ignored) {
            // No desktop integration: let LWJGL ask the system.
        }
        try {
            Sys.openURL(dir.toURI().toString());
        } catch (Throwable t) {
            setStatus("Open " + dir.getAbsolutePath(), 0xa0a0a0);
        }
    }

    /** Wears the model of a row (refused for damaged files). */
    void choose(int index) {
        if (index < 0 || index >= ids.size()) return;
        String id = ids.get(index);
        ModelRegistry.Entry e = registry().find(id);
        if (e != null && e.state() == ModelRegistry.State.FAILED) {
            setStatus(e.id + ": " + (e.error().isEmpty() ? "cannot be used" : e.error()), 0xff5555);
            return;
        }
        registry().setLocal(id);
        setStatus(e == null ? "You look like Steve (with your skin)" : "You wear " + e.name, 0x55ff55);
    }

    @Override
    public void drawScreen(int mouseX, int mouseY, float partialTicks) {
        drawDefaultBackground();
        list.drawScreen(mouseX, mouseY, partialTicks);
        drawCenteredString(fontRendererObj, "Choose Player Model", width / 2, 12, 0xffffff);
        int px = (width / 2 + 20 + width) / 2;
        String id = registry().local();
        ModelRegistry.Entry e = registry().find(id);
        if (mc.thePlayer != null) {
            int bottom = height - 74;
            int scale = Math.max(20, Math.min(60, (bottom - 40) * 10 / 21));
            GlStateManager.color(1, 1, 1, 1);
            GuiInventory.drawEntityOnScreen(px, bottom, scale, px - mouseX, bottom - scale * 3 / 2 - mouseY, mc.thePlayer);
        } else {
            drawCenteredString(fontRendererObj, "Join a world", px, height / 2 - 20, 0x808080);
            drawCenteredString(fontRendererObj, "to see the preview", px, height / 2 - 10, 0x808080);
        }
        String caption = e == null ? "Steve" : e.state() == ModelRegistry.State.LOADING || e.state() == ModelRegistry.State.UNLOADED ? "Loading " + e.name + "..." : e.name;
        drawCenteredString(fontRendererObj, fontRendererObj.trimStringToWidth(caption, width - px + 40), px, height - 68, 0xa0a0a0);
        // Credits of the chosen model (built-ins name their sources).
        String credits = e == null ? "" : e.credits;
        int y = height - 54;
        if (!status.isEmpty()) {
            drawCenteredString(fontRendererObj, fontRendererObj.trimStringToWidth(status, width - 20), width / 2, y, statusColor);
            y += 10;
        }
        if (!credits.isEmpty()) {
            List<String> lines = fontRendererObj.listFormattedStringToWidth(credits, width - 20);
            for (int i = 0; i < Math.min(status.isEmpty() ? 2 : 1, lines.size()); i++) {
                drawCenteredString(fontRendererObj, lines.get(i), width / 2, y, 0x808080);
                y += 10;
            }
        }
        super.drawScreen(mouseX, mouseY, partialTicks);
    }

    @Override
    public boolean doesGuiPauseGame() {
        return false;
    }

    /** The scrolling list of models. */
    private final class ModelList extends GuiSlot {
        ModelList(Minecraft mc, int width, int height, int top, int bottom, int slotHeight) {
            super(mc, width, height, top, bottom, slotHeight);
        }

        @Override
        protected int getSize() {
            return ids.size();
        }

        @Override
        protected void elementClicked(int index, boolean doubleClick, int mouseX, int mouseY) {
            choose(index);
            if (doubleClick) mc.displayGuiScreen(parent);
        }

        @Override
        protected boolean isSelected(int index) {
            return index >= 0 && index < ids.size() && ids.get(index).equalsIgnoreCase(registry().local());
        }

        @Override
        protected void drawBackground() {
        }

        @Override
        public int getListWidth() {
            return width - 14;
        }

        @Override
        protected int getScrollBarX() {
            return right - 6;
        }

        @Override
        protected void drawSlot(int index, int x, int y, int slotHeight, int mouseX, int mouseY) {
            String id = ids.get(index);
            ModelRegistry.Entry e = registry().find(id);
            String title;
            String detail;
            int detailColor = 0x808080;
            if (e == null) {
                title = "Steve";
                detail = "Vanilla, with your skin";
            } else {
                title = e.name;
                switch (e.state()) {
                    case FAILED:
                        detail = "Damaged: " + e.error();
                        detailColor = 0xff5555;
                        break;
                    case LOADING:
                        detail = "Loading...";
                        break;
                    default:
                        int tris = e.triangles >= 0 ? e.triangles : e.model() != null ? e.model().triangles : -1;
                        String size = tris >= 0 ? String.format(Locale.ROOT, "%,d triangles", tris) : "";
                        detail = (e.builtin ? "Built in" : id + ".mcpm") + (size.isEmpty() ? "" : ", " + size);
                }
            }
            int w = getListWidth() - 6;
            fontRendererObj.drawStringWithShadow(fontRendererObj.trimStringToWidth(title, w), x + 2, y + 1, 0xffffff);
            fontRendererObj.drawStringWithShadow(fontRendererObj.trimStringToWidth(detail, w), x + 2, y + 12, detailColor);
        }
    }
}
