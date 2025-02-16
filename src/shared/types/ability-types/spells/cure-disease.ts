import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class CureDisease implements IAbility {
  private static instance: CureDisease;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Cure Disease";
    this.helpFile = `
help 'Cure Disease'
'CURE DISEASE'
'CURE DISEASE'

Syntax: cast 'cure disease' <character>

This spell may cure various diseases that have afflicted a character.  

See also - CURATIVE 
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (CureDisease.instance === undefined) {
      CureDisease.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): CureDisease {
    if (!CureDisease.instance) {
      CureDisease.instance = new CureDisease();
    }
    return CureDisease.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return CureDisease.GetInstance() as T;
  }
}

export default CureDisease;
