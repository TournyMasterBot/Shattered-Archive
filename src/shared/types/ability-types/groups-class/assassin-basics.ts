import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Dagger from "@shared/types/ability-types/skills/dagger";
import SecondAttack from "@shared/types/ability-types/skills/second-attack";
import Assassinate from "@shared/types/ability-types/skills/assassinate";

export class AssassinBasics implements IAbilityGroup {
  static instance: AssassinBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.AssassinBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [Dagger.GetInstance().Get(), SecondAttack.GetInstance().Get(), Assassinate.GetInstance().Get()];
  }

  // Method to get the single instance of the class
  public static GetInstance(): AssassinBasics {
    if (!AssassinBasics.instance) {
      AssassinBasics.instance = new AssassinBasics();
    }
    return AssassinBasics.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return AssassinBasics.GetInstance() as T;
  }
}

export default AssassinBasics;
