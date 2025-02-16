import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Florentine from "@shared/types/ability-types/skills/florentine";
import Flurry from "@shared/types/ability-types/skills/flurry";
import Cross from "@shared/types/ability-types/skills/cross";

export class MasterySword implements IAbilityGroup {
  static instance: MasterySword;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.MasterySword;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilities = [Florentine.GetInstance().Get(), Flurry.GetInstance().Get(), Cross.GetInstance().Get()];
  }

  // Method to get the single instance of the class
  public static GetInstance(): MasterySword {
    if (!MasterySword.instance) {
      MasterySword.instance = new MasterySword();
    }
    return MasterySword.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return MasterySword.GetInstance() as T;
  }
}

export default MasterySword;
