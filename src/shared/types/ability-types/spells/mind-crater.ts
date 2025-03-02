import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class MindCrater implements IAbility {
  private static instance: MindCrater;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (MindCrater.instance === undefined) {
      MindCrater.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): MindCrater {
    if (!MindCrater.instance) {
      MindCrater.instance = new MindCrater();
    }
    return MindCrater.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return MindCrater.GetInstance() as T;
  }
}

export default MindCrater;
