import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class EnchantingTouch implements IAbility {
  private static instance: EnchantingTouch;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
ENCHANTING TOUCH

Syntax: cast 'enchanting touch' <victim>

Enchanting touch allows the enchantor to enchant a person's soul and imbue
their combat abilities. Its strength can vary depending on the enchantor,
and perhaps when the spell is cast.`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (EnchantingTouch.instance === undefined) {
      EnchantingTouch.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): EnchantingTouch {
    if (!EnchantingTouch.instance) {
      EnchantingTouch.instance = new EnchantingTouch();
    }
    return EnchantingTouch.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return EnchantingTouch.GetInstance() as T;
  }
}

export default EnchantingTouch;
