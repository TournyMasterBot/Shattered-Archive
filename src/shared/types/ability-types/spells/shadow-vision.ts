import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class ShadowVision implements IAbility {
  private static instance: ShadowVision;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Shadow Vision";
    this.helpFile = ""; // Empty help file
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (ShadowVision.instance === undefined) {
      ShadowVision.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): ShadowVision {
    if (!ShadowVision.instance) {
      ShadowVision.instance = new ShadowVision();
    }
    return ShadowVision.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ShadowVision.GetInstance() as T;
  }
}

export default ShadowVision;
