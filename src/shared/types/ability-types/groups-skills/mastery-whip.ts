import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Lash from "@shared/types/ability-types/skills/lash";
import Yank from "@shared/types/ability-types/skills/yank";
import Choke from "@shared/types/ability-types/skills/choke";

export class MasteryWhip implements IAbilityGroup {
  static instance: MasteryWhip;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.MasteryWhip;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilities = [
      Lash.GetInstance().Get(),
      Yank.GetInstance().Get(),
      Choke.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): MasteryWhip {
    if (!MasteryWhip.instance) {
      MasteryWhip.instance = new MasteryWhip();
    }
    return MasteryWhip.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return MasteryWhip.GetInstance() as T;
  }
}

export default MasteryWhip;
