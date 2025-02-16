import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Stab from "@shared/types/ability-types/skills/stab";
import Hurl from "@shared/types/ability-types/skills/hurl";
import ConcealedAttack from "@shared/types/ability-types/skills/concealed-attack";

export class MasteryDagger implements IAbilityGroup {
  static instance: MasteryDagger;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.MasteryDagger;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilities = [
      Stab.GetInstance().Get(),
      Hurl.GetInstance().Get(),
      ConcealedAttack.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): MasteryDagger {
    if (!MasteryDagger.instance) {
      MasteryDagger.instance = new MasteryDagger();
    }
    return MasteryDagger.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return MasteryDagger.GetInstance() as T;
  }
}

export default MasteryDagger;
