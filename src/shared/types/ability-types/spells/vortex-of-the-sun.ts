import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class VortexOfTheSun implements IAbility {
  private static instance: VortexOfTheSun;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Vortex of the Sun";
    this.helpFile = ``;
    this.manualDescription = ``;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (VortexOfTheSun.instance === undefined) {
      VortexOfTheSun.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): VortexOfTheSun {
    if (!VortexOfTheSun.instance) {
      VortexOfTheSun.instance = new VortexOfTheSun();
    }
    return VortexOfTheSun.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return VortexOfTheSun.GetInstance() as T;
  }
}

export default VortexOfTheSun;
