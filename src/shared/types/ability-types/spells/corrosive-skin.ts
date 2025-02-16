import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class CorrosiveSkin implements IAbility {
  private static instance: CorrosiveSkin;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Corrosive Skin";
    this.helpFile = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;
    this.manualDescription = "Causes damage when you are hit by physical skills, including those like ground control.";

    if (CorrosiveSkin.instance === undefined) {
      CorrosiveSkin.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): CorrosiveSkin {
    if (!CorrosiveSkin.instance) {
      CorrosiveSkin.instance = new CorrosiveSkin();
    }
    return CorrosiveSkin.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return CorrosiveSkin.GetInstance() as T;
  }
}

export default CorrosiveSkin;
