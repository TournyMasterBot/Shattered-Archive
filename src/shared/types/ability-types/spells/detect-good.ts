import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class DetectGood implements IAbility {
  private static instance: DetectGood;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help 'Detect Good'
'DETECT GOOD'
Syntax: cast 'detect good'
This spell enables the caster to detect good characters, which will
reveal a characteristic golden aura.
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (DetectGood.instance === undefined) {
      DetectGood.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): DetectGood {
    if (!DetectGood.instance) {
      DetectGood.instance = new DetectGood();
    }
    return DetectGood.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return DetectGood.GetInstance() as T;
  }
}

export default DetectGood;
