import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class DetectInvis implements IAbility {
  private static instance: DetectInvis;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Detect Invis";
    this.helpFile = `
help 'Detect Invis'
'DETECT INVIS'
'DETECT INVIS'
Syntax: cast 'detect invis'
This spell enables the caster to detect invisible objects and characters.
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (DetectInvis.instance === undefined) {
      DetectInvis.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): DetectInvis {
    if (!DetectInvis.instance) {
      DetectInvis.instance = new DetectInvis();
    }
    return DetectInvis.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return DetectInvis.GetInstance() as T;
  }
}

export default DetectInvis;
