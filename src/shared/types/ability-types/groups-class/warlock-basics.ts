import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Dagger from "@shared/types/ability-types/skills/dagger";
import Staff from "@shared/types/ability-types/skills/staff";

export class WarlockBasics implements IAbilityGroup {
  static instance: WarlockBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.WarlockBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [Dagger.GetInstance().Get(), Staff.GetInstance().Get()];
  }

  // Method to get the single instance of the class
  public static GetInstance(): WarlockBasics {
    if (!WarlockBasics.instance) {
      WarlockBasics.instance = new WarlockBasics();
    }
    return WarlockBasics.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return WarlockBasics.GetInstance() as T;
  }
}

export default WarlockBasics;
