import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Sword from "@shared/types/ability-types/skills/sword";
import SecondAttack from "@shared/types/ability-types/skills/second-attack";

export class ShadowknightBasics implements IAbilityGroup {
  static instance: ShadowknightBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.ShadowknightBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [
      Sword.GetInstance().Get(),
      SecondAttack.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): ShadowknightBasics {
    if (!ShadowknightBasics.instance) {
      ShadowknightBasics.instance = new ShadowknightBasics();
    }
    return ShadowknightBasics.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ShadowknightBasics.GetInstance() as T;
  }
}

export default ShadowknightBasics;
