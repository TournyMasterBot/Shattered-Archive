import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Staff from "@shared/types/ability-types/skills/staff";

export class EldritchBasics implements IAbilityGroup {
  static instance: EldritchBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.EldritchBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [Staff.GetInstance()];
  }

  // Method to get the single instance of the class
  public static GetInstance(): EldritchBasics {
    if (!EldritchBasics.instance) {
      EldritchBasics.instance = new EldritchBasics();
    }
    return EldritchBasics.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return EldritchBasics.GetInstance() as T;
  }
}

export default EldritchBasics;
