import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Sword from "@shared/types/ability-types/skills/sword";
import SecondAttack from "@shared/types/ability-types/skills/second-attack";

export class SamuraiBasics implements IAbilityGroup {
  static instance: SamuraiBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.SamuraiBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [Sword.GetInstance(), SecondAttack.GetInstance()];
  }

  // Method to get the single instance of the class
  public static GetInstance(): SamuraiBasics {
    if (!SamuraiBasics.instance) {
      SamuraiBasics.instance = new SamuraiBasics();
    }
    return SamuraiBasics.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return SamuraiBasics.GetInstance() as T;
  }
}

export default SamuraiBasics;
