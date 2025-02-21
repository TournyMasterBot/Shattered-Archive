import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import { AnalyticalMind as AnalyticalMindSkill } from "@shared/types/ability-types/skills/analytical-mind";

export class AnalyticalMind implements IAbilityGroup {
  private static instance: AnalyticalMind;

  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.AnalyticalMind;
    this.abilityGroupType = AbilityGroupType.Class;
    this.abilities = [new AnalyticalMindSkill()];
  }

  // Method to get the single instance of the class
  public static GetInstance(): AnalyticalMind {
    if (!AnalyticalMind.instance) {
      AnalyticalMind.instance = new AnalyticalMind();
    }
    return AnalyticalMind.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return AnalyticalMind.GetInstance() as T;
  }
}

export default AnalyticalMind;
