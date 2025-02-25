import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Entwine from "@shared/types/ability-types/skills/entwine";
import Sting from "@shared/types/ability-types/skills/sting";
import Strip from "@shared/types/ability-types/skills/strip";
import ServerCache from "@shared/cache/server-cache";

export class MasteryFlail implements IAbilityGroup {
  static instance: MasteryFlail;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.MasteryFlail;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilities = [Entwine.GetInstance(), Sting.GetInstance(), Strip.GetInstance()];
  }

  // Method to get the single instance of the class
  public static GetInstance(): MasteryFlail {
    if (!MasteryFlail.instance) {
      MasteryFlail.instance = new MasteryFlail();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return MasteryFlail.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return MasteryFlail.GetInstance() as T;
  }
}

export default MasteryFlail;
