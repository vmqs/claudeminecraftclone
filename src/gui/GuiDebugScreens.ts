import type { Minecraft } from '../client/Minecraft';
import { GuiAccountManager } from './GuiAccountManager';
import { GuiScreenRoomCode } from './GuiScreenRoomCode';
import { GuiSplashPreview } from './GuiSplashPreview';
import { GuiControls } from './GuiControls';
import { GuiCreateWorld } from './GuiCreateWorld';
import { GuiLanguage } from './GuiLanguage';
import { GuiMainMenu } from './GuiMainMenu';
import { GuiIngameMenu } from './GuiIngameMenu';
import { GuiMultiplayer, ServerData } from './GuiMultiplayer';
import { GuiScreenServerList } from './GuiScreenServerList';
import { GuiShareToLan } from './GuiShareToLan';
import { GuiOptions, GuiVideoSettings } from './GuiOptions';
import type { GuiScreen } from './GuiScreen';
import { GuiSelectWorld } from './GuiSelectWorld';
import { GuiSnooper } from './GuiSnooper';
import { GuiTexturePacks } from './GuiTexturePacks';
import { ScreenChatOptions } from './ScreenChatOptions';

/**
 * Screens by name for automation (`mc.dev.screen('options')`), the same names as the reference
 * harness's `screen` command where they exist. Screens registered by other modules can be added
 * with `screenFactories.set(name, factory)`.
 */
export const screenFactories = new Map<string, (mc: Minecraft) => GuiScreen | null>([
  ['none', () => null],
  ['mainmenu', () => new GuiMainMenu()],
  ['singleplayer', () => new GuiSelectWorld(new GuiMainMenu())],
  ['createworld', () => new GuiCreateWorld(new GuiSelectWorld(new GuiMainMenu()))],
  ['multiplayer', () => new GuiMultiplayer(new GuiMainMenu())],
  ['directconnect', () => new GuiScreenServerList(new GuiMultiplayer(new GuiMainMenu()), new ServerData('Minecraft Server', ''))],
  ['roomcode', () => new GuiScreenRoomCode(new GuiMultiplayer(new GuiMainMenu()), new ServerData('LAN', '', 'room'))],
  ['accountmanager', () => new GuiAccountManager(new GuiMainMenu())],
  ['splash1', () => new GuiSplashPreview(0)],
  ['splash2', () => new GuiSplashPreview(1)],
  ['pause', () => new GuiIngameMenu()],
  ['sharetolan', () => new GuiShareToLan(new GuiIngameMenu())],
  ['options', (mc) => new GuiOptions(new GuiMainMenu(), mc.gameSettings)],
  ['video', (mc) => new GuiVideoSettings(new GuiOptions(new GuiMainMenu(), mc.gameSettings), mc.gameSettings)],
  ['controls', (mc) => new GuiControls(new GuiOptions(new GuiMainMenu(), mc.gameSettings), mc.gameSettings)],
  ['language', (mc) => new GuiLanguage(new GuiMainMenu(), mc.gameSettings)],
  ['texturepacks', (mc) => new GuiTexturePacks(new GuiOptions(new GuiMainMenu(), mc.gameSettings), mc.gameSettings)],
  ['snooper', (mc) => new GuiSnooper(new GuiOptions(new GuiMainMenu(), mc.gameSettings), mc.gameSettings)],
  ['chatoptions', (mc) => new ScreenChatOptions(new GuiOptions(new GuiMainMenu(), mc.gameSettings), mc.gameSettings)],
]);

/** Opens a screen by name; false when the name is unknown. */
export function openScreenByName(mc: Minecraft, name: string): boolean {
  const f = screenFactories.get(name);
  if (!f) return false;
  mc.displayGuiScreen(f(mc));
  return true;
}
