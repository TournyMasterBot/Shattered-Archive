import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class CureBlindness implements IAbility {
  private static instance: CureBlindness;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Cure Blindness";
    this.helpFile = `
help 'Cure Blindness'
'CURE BLINDNESS'
'CURE BLINDNESS'
Syntax: cast 'cure blindness' <character>
This spell cures blindness in one so unfortunate.
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (CureBlindness.instance === undefined) {
      CureBlindness.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): CureBlindness {
    if (!CureBlindness.instance) {
      CureBlindness.instance = new CureBlindness();
    }
    return CureBlindness.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return CureBlindness.GetInstance() as T;
  }
}

export default CureBlindness;
