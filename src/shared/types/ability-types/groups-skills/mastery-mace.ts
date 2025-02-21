import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Backhand from "@shared/types/ability-types/skills/backhand";
import Drum from "@shared/types/ability-types/skills/drum";
import Boneshatter from "@shared/types/ability-types/skills/boneshatter";

export class MasteryMace implements IAbilityGroup {
  static instance: MasteryMace;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.MasteryMace;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilities = [Backhand.GetInstance().Get(), Drum.GetInstance().Get(), Boneshatter.GetInstance().Get()];
  }

  // Method to get the single instance of the class
  public static GetInstance(): MasteryMace {
    if (!MasteryMace.instance) {
      MasteryMace.instance = new MasteryMace();
    }
    return MasteryMace.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return MasteryMace.GetInstance() as T;
  }
}

export default MasteryMace;
