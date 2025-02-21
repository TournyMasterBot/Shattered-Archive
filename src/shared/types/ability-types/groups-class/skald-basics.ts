import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Axe from "@shared/types/ability-types/skills/axe";

export class SkaldBasics implements IAbilityGroup {
  static instance: SkaldBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.SkaldBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [Axe.GetInstance().Get()];
  }

  // Method to get the single instance of the class
  public static GetInstance(): SkaldBasics {
    if (!SkaldBasics.instance) {
      SkaldBasics.instance = new SkaldBasics();
    }
    return SkaldBasics.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return SkaldBasics.GetInstance() as T;
  }
}

export default SkaldBasics;
