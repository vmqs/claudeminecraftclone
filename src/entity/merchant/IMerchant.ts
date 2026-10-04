import type { EntityPlayer } from '../EntityPlayer';
import type { MerchantRecipe } from './MerchantRecipe';
import type { MerchantRecipeList } from './MerchantRecipeList';

/** Something that trades with a player (IMerchant): villagers. */
export interface IMerchant {
  setCustomer(player: EntityPlayer | null): void;
  getCustomer(): EntityPlayer | null;
  getRecipes(player: EntityPlayer): MerchantRecipeList | null;
  setRecipes(list: MerchantRecipeList): void;
  useRecipe(recipe: MerchantRecipe): void;
}
