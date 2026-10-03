import { Mouse } from '../client/Keyboard';
import { I18n } from '../core/I18n';
import { Item } from '../item/Item';
import { ItemStack } from '../item/ItemStack';
import { GL } from '../render/gl/GL';
import { RenderItem } from '../render/entity/RenderItem';
import { RenderHelper } from '../render/RenderHelper';
import { Tessellator } from '../render/gl/Tessellator';
import type { StatBase, StatCrafting } from '../stats/StatBase';
import type { StatFileWriter } from '../stats/StatFileWriter';
import { StatList } from '../stats/StatList';
import { GuiButton } from './GuiButton';
import { GuiScreen } from './GuiScreen';
import { GuiSlot } from './GuiSlot';

const EVEN = 0xffffff;
const ODD = 0x909090;
/** Right edges of the three value columns, relative to the row's x. */
const COLUMNS = [115, 165, 215] as const;

/**
 * The Statistics screen (GuiStats): General (every counter with its value), Blocks (crafted,
 * used and mined per block) and Items (depleted, crafted and used per item). The two tables
 * list only what has a count, and sort by a column when its header icon is clicked (down,
 * up, off).
 */
export class GuiStats extends GuiScreen {
  private static readonly renderItem = new RenderItem();
  private statsTitle = 'Select world';
  private slotGeneral!: GuiSlotStatsGeneral;
  private slotItem!: GuiSlotStatsItem;
  private slotBlock!: GuiSlotStatsBlock;
  private selectedSlot!: GuiSlot;

  constructor(
    private readonly parentGui: GuiScreen | null,
    readonly statFileWriter: StatFileWriter,
  ) {
    super();
  }

  override initGui(): void {
    StatList.init();
    this.statsTitle = I18n.translateToLocal('gui.stats');
    this.slotGeneral = new GuiSlotStatsGeneral(this);
    this.slotGeneral.registerScrollButtons(this.buttonList, 1, 1);
    this.slotItem = new GuiSlotStatsItem(this);
    this.slotItem.registerScrollButtons(this.buttonList, 1, 1);
    this.slotBlock = new GuiSlotStatsBlock(this);
    this.slotBlock.registerScrollButtons(this.buttonList, 1, 1);
    this.selectedSlot = this.slotGeneral;
    this.addHeaderButtons();
  }

  private addHeaderButtons(): void {
    const t = (k: string) => I18n.translateToLocal(k);
    const cx = Math.trunc(this.width / 2);
    this.buttonList.push(new GuiButton(0, cx + 4, this.height - 28, 150, 20, t('gui.done')));
    this.buttonList.push(new GuiButton(1, cx - 154, this.height - 52, 100, 20, t('stat.generalButton')));
    const blocks = new GuiButton(2, cx - 46, this.height - 52, 100, 20, t('stat.blocksButton'));
    const items = new GuiButton(3, cx + 62, this.height - 52, 100, 20, t('stat.itemsButton'));
    this.buttonList.push(blocks, items);
    if (this.slotBlock.size() === 0) blocks.enabled = false;
    if (this.slotItem.size() === 0) items.enabled = false;
  }

  protected override actionPerformed(b: GuiButton): void {
    if (!b.enabled) return;
    if (b.id === 0) this.mc.displayGuiScreen(this.parentGui);
    else if (b.id === 1) this.selectedSlot = this.slotGeneral;
    else if (b.id === 3) this.selectedSlot = this.slotItem;
    else if (b.id === 2) this.selectedSlot = this.slotBlock;
    else this.selectedSlot.actionPerformed(b);
  }

  /** Which page is shown ('general', 'blocks' or 'items'), for scenarios. */
  getPage(): string {
    return this.selectedSlot === this.slotBlock ? 'blocks' : this.selectedSlot === this.slotItem ? 'items' : 'general';
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    this.selectedSlot.drawScreen(mx, my, pt);
    this.drawCenteredString(this.fontRenderer, this.statsTitle, Math.trunc(this.width / 2), 20, 0xffffff);
    super.drawScreen(mx, my, pt);
  }

  /** An item in a slot frame (drawItemSprite). */
  drawItemSprite(x: number, y: number, itemID: number): void {
    this.drawSprite(x + 1, y + 1, 0, 0);
    GL.enable(GL.RESCALE_NORMAL);
    RenderHelper.enableGUIStandardItemLighting();
    GuiStats.renderItem.renderItemIntoGUI(this.fontRenderer, this.mc.renderEngine, new ItemStack(itemID, 1, 0), x + 2, y + 2);
    RenderHelper.disableStandardItemLighting();
    GL.disable(GL.RESCALE_NORMAL);
  }

  /** An 18x18 sprite of /gui/slot.png (a 128-pixel sheet). */
  drawSprite(x: number, y: number, u: number, v: number): void {
    GL.color(1, 1, 1, 1);
    this.mc.renderEngine.bindTexture('/gui/slot.png');
    const k = 0.0078125;
    const t = Tessellator.instance;
    t.startDrawingQuads();
    t.addVertexWithUV(x + 0, y + 18, this.zLevel, (u + 0) * k, (v + 18) * k);
    t.addVertexWithUV(x + 18, y + 18, this.zLevel, (u + 18) * k, (v + 18) * k);
    t.addVertexWithUV(x + 18, y + 0, this.zLevel, (u + 18) * k, (v + 0) * k);
    t.addVertexWithUV(x + 0, y + 0, this.zLevel, (u + 0) * k, (v + 0) * k);
    t.draw();
  }

  /** drawGradientRect for the lists' tooltips. */
  drawTooltipBox(x0: number, y0: number, x1: number, y1: number): void {
    this.drawGradientRect(x0, y0, x1, y1, 0xc0000000 | 0, 0xc0000000 | 0);
  }

  get font() {
    return this.fontRenderer;
  }
}

/** The General page (GuiSlotStatsGeneral): one 10-pixel row per general statistic. */
class GuiSlotStatsGeneral extends GuiSlot {
  constructor(private readonly statsGui: GuiStats) {
    super(statsGui.mc, statsGui.width, statsGui.height, 32, statsGui.height - 64, 10);
    this.setShowSelectionBox(false);
  }

  protected getSize(): number {
    return StatList.generalStats.length;
  }

  protected elementClicked(): void {}

  protected isSelected(): boolean {
    return false;
  }

  protected override getContentHeight(): number {
    return this.getSize() * 10;
  }

  protected drawBackground(): void {
    this.statsGui.drawDefaultBackground();
  }

  protected drawSlot(index: number, x: number, y: number): void {
    const s = StatList.generalStats[index];
    const fr = this.statsGui.font;
    const color = index % 2 === 0 ? EVEN : ODD;
    this.statsGui.drawString(fr, I18n.translateToLocal(s.getName()), x + 2, y + 1, color);
    const v = s.format(this.statsGui.statFileWriter.writeStat(s));
    this.statsGui.drawString(fr, v, x + 2 + 213 - fr.getStringWidth(v), y + 1, color);
  }
}

/** The Blocks and Items tables (GuiSlotStats): an icon column and three sortable value columns. */
abstract class GuiSlotStats extends GuiSlot {
  /** The header column being pressed (field_77262_g). */
  protected pressedColumn = -1;
  /** The column sorted by (field_77264_j) and the direction, -1 descending or 1 ascending (field_77265_k). */
  sortColumn = -1;
  sortDirection = 0;
  protected readonly rows: StatCrafting[] = [];

  constructor(protected readonly statsGui: GuiStats) {
    super(statsGui.mc, statsGui.width, statsGui.height, 32, statsGui.height - 64, 20);
    this.setShowSelectionBox(false);
    this.setHasListHeader(true, 20);
  }

  /** The three statistics tables of the columns, left to right. */
  protected abstract columnTables(): readonly (readonly (StatBase | null)[])[];
  /** The header icons' sprites (u) in /gui/slot.png's second row. */
  protected abstract headerSprites(): readonly number[];
  /** func_77258_c: the column's tooltip key. */
  protected abstract columnName(column: number): string;

  protected elementClicked(): void {}

  protected isSelected(): boolean {
    return false;
  }

  protected drawBackground(): void {
    this.statsGui.drawDefaultBackground();
  }

  size(): number {
    return this.rows.length;
  }

  protected getSize(): number {
    return this.rows.length;
  }

  /** Keeps the rows whose statistics have a count (in any of the three tables). */
  protected fill(candidates: readonly StatCrafting[], tables: readonly (readonly (StatBase | null)[])[]): void {
    const w = this.statsGui.statFileWriter;
    for (const s of candidates) {
      const id = s.getItemID();
      if (w.writeStat(s) > 0 || tables.some((t) => t !== null && t[id] && w.writeStat(t[id]!) > 0)) this.rows.push(s);
    }
  }

  protected override drawListHeader(x: number, y: number): void {
    if (!Mouse.isButtonDown(0)) this.pressedColumn = -1;
    const g = this.statsGui;
    for (let c = 0; c < 3; c++) g.drawSprite(x + COLUMNS[c] - 18, y + 1, 0, this.pressedColumn === c ? 0 : 18);
    if (this.sortColumn !== -1) g.drawSprite(x + [79, 129, 179][this.sortColumn], y + 1, this.sortDirection === 1 ? 36 : 18, 0);
    const sprites = this.headerSprites();
    for (let c = 0; c < 3; c++) {
      const down = this.pressedColumn === c ? 1 : 0;
      g.drawSprite(x + COLUMNS[c] - 18 + down, y + 1 + down, sprites[c], 18);
    }
  }

  protected override headerClicked(x: number): void {
    this.pressedColumn = -1;
    if (x >= 79 && x < 115) this.pressedColumn = 0;
    else if (x >= 129 && x < 165) this.pressedColumn = 1;
    else if (x >= 179 && x < 215) this.pressedColumn = 2;
    if (this.pressedColumn >= 0) {
      this.sortBy(this.pressedColumn);
      this.statsGui.mc.sndManager.playSoundFX('random.click', 1, 1);
    }
  }

  protected drawSlot(index: number, x: number, y: number): void {
    const s = this.rows[index];
    const id = s.getItemID();
    this.statsGui.drawItemSprite(x + 40, y, id);
    const tables = this.columnTables();
    for (let c = 0; c < 3; c++) this.drawValue(tables[c][id] ?? null, x + COLUMNS[c], y, index % 2 === 0);
  }

  /** func_77260_a: a value right-aligned at `x`, or "-" where the statistic does not exist. */
  private drawValue(stat: StatBase | null, x: number, y: number, even: boolean): void {
    const fr = this.statsGui.font;
    const text = stat ? stat.format(this.statsGui.statFileWriter.writeStat(stat)) : '-';
    this.statsGui.drawString(fr, text, x - fr.getStringWidth(text), y + 5, even ? EVEN : ODD);
  }

  /** func_77215_b: the item name over an icon, or the column name over a header icon. */
  protected override drawOverlay(mx: number, my: number): void {
    if (my < this.top || my > this.bottom) return;
    const index = this.getSlotIndexFromScreenCoords(mx, my);
    const x0 = Math.trunc(this.statsGui.width / 2) - 92 - 16;
    let text: string;
    if (index >= 0) {
      if (mx < x0 + 40 || mx > x0 + 40 + 20) return;
      const item = Item.itemsList[this.rows[index].getItemID()];
      if (!item) return;
      text = item.getStatName().trim();
    } else {
      let column = -1;
      for (let c = 0; c < 3; c++) if (mx >= x0 + COLUMNS[c] - 18 && mx <= x0 + COLUMNS[c]) column = c;
      if (column < 0) return;
      text = I18n.translateToLocal(this.columnName(column)).trim();
    }
    if (text.length === 0) return;
    const fr = this.statsGui.font;
    const x = mx + 12;
    const y = my - 12;
    this.statsGui.drawTooltipBox(x - 3, y - 3, x + fr.getStringWidth(text) + 3, y + 8 + 3);
    fr.drawStringWithShadow(text, x, y, -1);
  }

  /** func_77261_e: a new column sorts descending, again ascending, a third time back to id order. */
  sortBy(column: number): void {
    if (column !== this.sortColumn) {
      this.sortColumn = column;
      this.sortDirection = -1;
    } else if (this.sortDirection === -1) {
      this.sortDirection = 1;
    } else {
      this.sortColumn = -1;
      this.sortDirection = 0;
    }
    const w = this.statsGui.statFileWriter;
    const table = this.sortColumn >= 0 ? this.columnTables()[this.sortColumn] : null;
    this.rows.sort((a, b) => {
      const ia = a.getItemID();
      const ib = b.getItemID();
      const sa = table ? (table[ia] ?? null) : null;
      const sb = table ? (table[ib] ?? null) : null;
      if (sa !== null || sb !== null) {
        if (sa === null) return 1;
        if (sb === null) return -1;
        const va = w.writeStat(sa);
        const vb = w.writeStat(sb);
        if (va !== vb) return (va - vb) * this.sortDirection;
      }
      return ia - ib;
    });
  }
}

/** The Blocks page (GuiSlotStatsBlock): crafted, used and mined per block. */
class GuiSlotStatsBlock extends GuiSlotStats {
  constructor(gui: GuiStats) {
    super(gui);
    this.fill(StatList.objectMineStats, [StatList.objectUseStats, StatList.objectCraftStats]);
  }

  protected columnTables() {
    return [StatList.objectCraftStats, StatList.objectUseStats, StatList.mineBlockStatArray];
  }

  protected headerSprites() {
    return [18, 36, 54];
  }

  protected columnName(column: number): string {
    return column === 0 ? 'stat.crafted' : column === 1 ? 'stat.used' : 'stat.mined';
  }
}

/** The Items page (GuiSlotStatsItem): depleted, crafted and used per item. */
class GuiSlotStatsItem extends GuiSlotStats {
  constructor(gui: GuiStats) {
    super(gui);
    this.fill(StatList.itemStats, [StatList.objectBreakStats, StatList.objectCraftStats]);
  }

  protected columnTables() {
    return [StatList.objectBreakStats, StatList.objectCraftStats, StatList.objectUseStats];
  }

  protected headerSprites() {
    return [72, 18, 36];
  }

  protected columnName(column: number): string {
    return column === 1 ? 'stat.crafted' : column === 2 ? 'stat.used' : 'stat.depleted';
  }
}
