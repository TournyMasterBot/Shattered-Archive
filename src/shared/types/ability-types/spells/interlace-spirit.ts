import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class InterlaceSpirit implements IAbility {
  private static instance: InterlaceSpirit;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Interlace Spirit";
    this.helpFile = `INTERLACE SPIRIT

Syntax: cast 'interlace spirit' <object>

Interlace spirit allows an enchantor to interlace his/her own spirit into
the given weapon or piece of armor.  Interlace spirit does not remove
anything from the current object, but _does_ interlace your own spirit with
any other aura it already has.`;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (InterlaceSpirit.instance === undefined) {
      InterlaceSpirit.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): InterlaceSpirit {
    if (!InterlaceSpirit.instance) {
      InterlaceSpirit.instance = new InterlaceSpirit();
    }
    return InterlaceSpirit.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return InterlaceSpirit.GetInstance() as T;
  }
}

export default InterlaceSpirit;
