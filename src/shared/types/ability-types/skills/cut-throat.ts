import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class CutThroat implements IAbility {
  private static instance: CutThroat;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Cut Throat";
    this.helpFile = `
cut throat
Command: Cutthroat

A hidden Nightshade may use this skill to start a battle with unusually high
damage. The skill does require some time and a still target for it to work.
`;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.manualDescription = "";

    if (CutThroat.instance === undefined) {
      CutThroat.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): CutThroat {
    if (!CutThroat.instance) {
      CutThroat.instance = new CutThroat();
    }
    return CutThroat.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return CutThroat.GetInstance() as T;
  }
}

export default CutThroat;
