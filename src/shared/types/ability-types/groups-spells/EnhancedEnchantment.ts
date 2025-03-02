import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Disenchant from "@shared/types/ability-types/spells/Disenchant";
import RestoreArmor from "@shared/types/ability-types/spells/RestoreArmor";
import AnimateObject from "@shared/types/ability-types/spells/AnimateObject";
import InvoluntaryWizardry from "@shared/types/ability-types/spells/InvoluntaryWizardry";
import Sequestor from "@shared/types/ability-types/spells/Sequestor";
import WitheringEnchant from "@shared/types/ability-types/spells/WitheringEnchant";
import InterlaceSpirit from "@shared/types/ability-types/spells/InterlaceSpirit";
import WavesOfWeariness from "@shared/types/ability-types/spells/WavesOfWeariness";
import EnchantingTouch from "@shared/types/ability-types/spells/enchanting-touch";
import RestoreWeapon from "@shared/types/ability-types/spells/RestoreWeapon";
import EnchantGem from "@shared/types/ability-types/spells/enchant-gem";
import Jest from "@shared/types/ability-types/spells/Jest";
import ContinualLight from "@shared/types/ability-types/spells/ContinualLight";
import ServerCache from "@shared/cache/server-cache";

export class EnhancedEnchantment implements IAbilityGroup {
  static instance: EnhancedEnchantment;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.EnhancedEnchantment;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      Disenchant.GetInstance(),
      RestoreArmor.GetInstance(),
      AnimateObject.GetInstance(),
      InvoluntaryWizardry.GetInstance(),
      Sequestor.GetInstance(),
      WitheringEnchant.GetInstance(),
      InterlaceSpirit.GetInstance(),
      WavesOfWeariness.GetInstance(),
      EnchantingTouch.GetInstance(),
      RestoreWeapon.GetInstance(),
      EnchantGem.GetInstance(),
      Jest.GetInstance(),
      ContinualLight.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): EnhancedEnchantment {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return EnhancedEnchantment.GetInstance() as T;
  }
}

export default EnhancedEnchantment;
