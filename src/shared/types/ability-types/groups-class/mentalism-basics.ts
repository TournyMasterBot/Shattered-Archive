import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Dagger from "@shared/types/ability-types/skills/dagger";
import Staff from "@shared/types/ability-types/skills/staff";

export class MentalistBasics implements IAbilityGroup {
  static instance: MentalistBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.MentalistBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [Dagger.GetInstance().Get(), Staff.GetInstance().Get()];
  }

  // Method to get the single instance of the class
  public static GetInstance(): MentalistBasics {
    if (!MentalistBasics.instance) {
      MentalistBasics.instance = new MentalistBasics();
    }
    return MentalistBasics.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return MentalistBasics.GetInstance() as T;
  }
}

export default MentalistBasics;
