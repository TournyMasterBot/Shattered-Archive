import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class EnchantArmor implements IAbility {
  private static instance: EnchantArmor;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help enchant armor
'ENCHANT ARMOR'
Syntax: cast 'enchant armor' <object>
The enchant armor spell imbues armor with powerful protective magics. It is
not nearly as reliable as enchant weapon, being far more prone to destructive
effects. Each successful enchant increases the plus of the armor by 1 or 2
points, and raises its level by one.`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (EnchantArmor.instance === undefined) {
      EnchantArmor.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): EnchantArmor {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return EnchantArmor.GetInstance() as T;
  }
}

export default EnchantArmor;
